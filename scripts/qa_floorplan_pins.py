#!/usr/bin/env python3
"""Live browser QA for the floorplan pin workflow (Playwright + real UI clicks).

Run the backend (uvicorn :8000) and frontend (vite :5173) against the dev DB,
export QA_ADMIN_TOKEN, then run with a Playwright-equipped interpreter
(system python3 or any venv with playwright installed).
Uses /usr/bin/google-chrome. Creates and deletes its own QA rows plus a
floorplan_versions fixture; safe against the dev database.
"""
import json, subprocess, sys, urllib.request

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
API = "http://127.0.0.1:8000/api"
import os
ADMIN = os.environ.get("QA_ADMIN_TOKEN", "")
if not ADMIN:
    sys.exit("Set QA_ADMIN_TOKEN to a dev JWT (sub=admin.bjs). Mint: cd backend && ./.venv/bin/python -c \"from dependencies import create_access_token; print(create_access_token({'sub':'admin.bjs'}))\"")

FAILURES = []
def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)

def psql(sql):
    r = subprocess.run(
        ["docker", "exec", "pusecgis-db", "psql", "-U", "pusecgis", "-d", "pusecgis_dev", "-tAc", sql],
        capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def api(method, path, body=None):
    req = urllib.request.Request(API + path, method=method,
        headers={"Authorization": f"Bearer {ADMIN}", "Content-Type": "application/json"})
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None

def get_incident(iid):
    rows = psql(f"select row_to_json(t) from (select id, location_ref, round(ST_X(geom::geometry)::numeric,6) as latitude, round(ST_Y(geom::geometry)::numeric,6) as longitude, status, floorplan_version_id, round(floorplan_x::numeric,4) x, round(floorplan_y::numeric,4) y, room_label from incidents where id={iid}) t")
    return json.loads(rows)

def get_history(iid):
    rows = psql(f"select coalesce(json_agg(row_to_json(t) order by t.created_at desc),'[]') from (select floorplan_version_id, reason, actor_id, created_at from incident_floorplan_pin_history where incident_id={iid}) t")
    return json.loads(rows)

def select_floor(page, query, floor_name):
    # selector panel only exists in floorplan view
    page.get_by_role("button", name="Floorplan", exact=True).click()
    page.wait_for_timeout(400)
    combo = page.locator('input[aria-label="Search floor plans"]')
    combo.click()
    combo.fill(query)
    page.wait_for_timeout(600)
    page.get_by_role("button", name=floor_name, exact=True).first.click()
    page.wait_for_timeout(1200)

def overlay_bbox(page, max_steps=10):
    """Return a fully on-screen bbox of the floorplan overlay, panning/zooming the map as needed."""
    vp = page.viewport_size
    vw, vh = vp["width"], vp["height"]
    margin = 60
    for _ in range(max_steps):
        box = page.locator(".leaflet-image-layer").first.bounding_box(timeout=8000)
        if box["width"] > vw - 2 * margin or box["height"] > vh - 2 * margin:
            page.locator(".leaflet-control-zoom-out").click()
            page.wait_for_timeout(450)
            continue
        if (box["x"] >= margin and box["y"] >= margin
                and box["x"] + box["width"] <= vw - margin
                and box["y"] + box["height"] <= vh - margin):
            return box
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        dx, dy = vw / 2 - cx, vh / 2 - cy
        # drag from a safe empty map spot so the sheet follows the cursor
        gx, gy = vw * 0.30, vh * 0.75
        page.mouse.move(gx, gy)
        page.mouse.down()
        page.mouse.move(gx + dx, gy + dy, steps=8)
        page.mouse.up()
        page.wait_for_timeout(450)
    return page.locator(".leaflet-image-layer").first.bounding_box()

def qa_page():
    # unique marker so we can find our cards/rows
    return "QA-" + str(subprocess.run(["date", "+%H%M%S"], capture_output=True, text=True).stdout.strip())

def main():
    marker = qa_page()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path="/usr/bin/google-chrome",
                                    args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(BASE + "/login")
        page.evaluate(f"localStorage.setItem('access_token', {json.dumps(ADMIN)})")
        page.goto(BASE + "/officer")
        page.wait_for_selector(".leaflet-container", timeout=15000)
        print("[ui] officer dashboard loaded")

        # registry truth
        plans = api("GET", "/floorplans")
        cam1 = next(e for e in plans if e["floor_id"] == "cam-l1")
        cam2 = next(e for e in plans if e["floor_id"] == "cam-l2")
        v1, v2 = cam1["current_version_id"], cam2["current_version_id"]

        # ---------- 1. create pin on floorplan ----------
        select_floor(page, "cam level 1", "Level 1 (CAM)")
        toggle = page.locator('button[title*="incident on map"], button[title*="map placement"]')
        toggle.click()
        box = overlay_bbox(page)
        page.mouse.click(box["x"] + box["width"] * 0.33, box["y"] + box["height"] * 0.33)
        page.wait_for_selector('.modal h2:has-text("New Incident")', timeout=5000)
        page.fill("#room-label", marker + "-1A")
        page.fill("#description", "QA card " + marker + "-1A")
        page.click("button[type=submit]:has-text('Create')")
        page.wait_for_selector('.modal h2:has-text("New Incident")', state="detached", timeout=8000)
        iid = int(psql(f"select id from incidents where room_label='{marker}-1A' order by id desc limit 1"))
        inc = get_incident(iid)
        check("1a create: incident stored", iid > 0, f"id={iid}")
        check("1b create: exact registry version used", inc["floorplan_version_id"] == v1, f"{inc['floorplan_version_id']} vs {v1}")
        check("1c create: normalized coords in [0,1]", inc["x"] is not None and 0 <= float(inc["x"]) <= 1 and 0 <= float(inc["y"]) <= 1, f"x={inc['x']} y={inc['y']}")
        check("1d create: geographic coords independent (null)", inc["latitude"] is None and inc["longitude"] is None)

        # ---------- 2. historical version fixture: bump cam-l1 to a NEW current version ----------
        psql(f"""
          INSERT INTO floorplan_versions (floorplan_id, version, campus, building, building_id, floor_name, image, south, west, north, east, rotation)
          SELECT floorplan_id, version+1, campus, building, building_id, floor_name, image, south, west, north, east, 20
          FROM floorplan_versions WHERE id={v1};
          UPDATE floorplans SET current_version_id=(SELECT max(id) FROM floorplan_versions WHERE floorplan_id=(SELECT floorplan_id FROM floorplan_versions WHERE id={v1}))
          WHERE floor_id='cam-l1';
        """)
        new_current = int(psql(f"select current_version_id from floorplans where floor_id='cam-l1'"))
        check("2a fixture: registry now on newer version", new_current != v1, f"current={new_current}, incident still {v1}")

        # ---------- 3. edit shows exact historical version (reposition keeps OLD version) ----------
        page.reload(); page.wait_for_selector(".leaflet-container", timeout=15000)
        card = page.locator(".incident-card", has_text=marker + "-1A").first
        card.locator("button.btn-edit").click()
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
        check("3a edit: historical room label loaded", page.locator("#room-label").input_value() == marker + "-1A")
        page.click("button:has-text('Reposition on floorplan')")
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', state="detached", timeout=5000)
        box = overlay_bbox(page)
        page.mouse.click(box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.6)
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
        page.fill("#pin-change-reason", "QA reposition to older sheet")
        page.click("button[type=submit]:has-text('Update')")
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', state="detached", timeout=8000)
        inc = get_incident(iid)
        check("3b edit kept exact historical version (not registry current)", inc["floorplan_version_id"] == v1, f"{inc['floorplan_version_id']} vs historical {v1} (registry now {new_current})")
        hist = get_history(iid)
        check("3c reposition wrote history with reason", any(h["floorplan_version_id"] == v1 and h["reason"] == "QA reposition to older sheet" for h in hist), str(hist))

        # ---------- 4. reposition WITHOUT reason is blocked ----------
        page.locator(".incident-card", has_text=marker + "-1A").first.locator("button.btn-edit").click()
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
        page.click("button:has-text('Reposition on floorplan')")
        box = overlay_bbox(page)
        page.mouse.click(box["x"] + box["width"] * 0.6, box["y"] + box["height"] * 0.4)
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
        page.click("button[type=submit]:has-text('Update')")
        page.wait_for_selector(".form-error, div[style*='DC2626']", timeout=5000)
        err = page.locator(".modal").inner_text()
        check("4a reposition without reason rejected in UI", "reason is required" in err.lower())
        # now reassign to a DIFFERENT sheet (cam-l2) with a reason
        page.click("button:has-text('Reposition on floorplan')")
        combo = page.locator('input[aria-label="Search floor plans"]')
        combo.click(); combo.fill("cam level 2"); page.wait_for_timeout(600)
        page.get_by_role("button", name="Level 2 (CAM)", exact=True).first.click()
        page.wait_for_timeout(1200)
        box = overlay_bbox(page)
        page.mouse.click(box["x"] + box["width"] * 0.33, box["y"] + box["height"] * 0.33)
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
        page.fill("#pin-change-reason", "QA moved to CAM level 2")
        page.click("button[type=submit]:has-text('Update')")
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', state="detached", timeout=8000)
        inc = get_incident(iid)
        check("4b reassign to another sheet works", inc["floorplan_version_id"] == v2, f"{inc['floorplan_version_id']} vs {v2}")
        hist = get_history(iid)
        check("4c reassign preserved previous version in history", any(h["floorplan_version_id"] == v1 for h in hist))

        # ---------- 5. clear pin requires reason, then history still visible ----------
        page.locator(".incident-card", has_text=marker + "-1A").first.locator("button.btn-edit").click()
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
        page.locator("label:has-text('Clear existing floorplan pin') input[type=checkbox]").check()
        page.click("button[type=submit]:has-text('Update')")
        page.wait_for_selector(".modal", timeout=5000)
        err = page.locator(".modal").inner_text()
        check("5a clear without reason rejected", "reason is required" in err.lower())
        page.fill("#pin-change-reason", "QA cleared pin")
        page.click("button[type=submit]:has-text('Update')")
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', state="detached", timeout=8000)
        inc = get_incident(iid)
        check("5b cleared: pin fields null", inc["floorplan_version_id"] is None and inc["x"] is None and inc["y"] is None)
        hist = get_history(iid)
        check("5c clear wrote history row", any(h["reason"] == "QA cleared pin" for h in hist), f"{len(hist)} rows")
        # history visible even with cleared pin
        page.locator(".incident-card", has_text=marker + "-1A").first.locator("button:has-text('Pin history')").click()
        page.wait_for_timeout(800)
        body = page.locator("body").inner_text()
        check("5d pin history panel shows reasons after clearing", "QA moved to CAM level 2" in body and "QA cleared pin" in body)

        # ---------- 6. geographic coords stay independent when pin exists ----------
        # street-map placement (no floorplan selected) then assign floorplan; geo coords must persist
        clear_btn = page.locator('button[aria-label="Clear floor selection"]')
        if clear_btn.count():
            clear_btn.click()  # normal click: selector panel now sits below the map-overlay stack
            page.wait_for_timeout(800)
        page.get_by_role("button", name="Street Map", exact=True).click()
        page.wait_for_timeout(600)
        page.locator('button[title*="incident on map"], button[title*="map placement"]').click()
        container = page.locator(".leaflet-container").bounding_box()
        page.mouse.click(container["x"] + container["width"] * 0.55, container["y"] + container["height"] * 0.45)
        page.wait_for_selector('.modal h2:has-text("New Incident")', timeout=5000)
        page.fill("#location", "QA street spot " + marker)
        page.click("button[type=submit]:has-text('Create')")
        page.wait_for_selector('.modal h2:has-text("New Incident")', state="detached", timeout=8000)
        iid2 = int(psql(f"select id from incidents where location_ref='QA street spot {marker}' and floorplan_version_id is null and geom is not null order by id desc limit 1"))
        inc2 = get_incident(iid2)
        check("6a street placement stored geographic coords, no pin", inc2["latitude"] is not None and inc2["floorplan_version_id"] is None)
        page.reload(); page.wait_for_selector(".leaflet-container", timeout=15000)
        card2 = page.locator(".incident-card", has_text="QA street spot " + marker).first
        card2.locator("button.btn-edit").click()
        page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
        target = page.locator("button:has-text('Assign to a floorplan')").count()
        check("6b street incident shows 'Assign to a floorplan'", target > 0)
        if target > 0:
            page.click("button:has-text('Assign to a floorplan')")
            page.get_by_role("button", name="Floorplan", exact=True).click()
            page.wait_for_timeout(500)
            combo = page.locator('input[aria-label="Search floor plans"]')
            combo.click(); combo.fill("cam level 1"); page.wait_for_timeout(600)
            page.get_by_role("button", name="Level 1 (CAM)", exact=True).first.click()
            page.wait_for_timeout(1200)
            box = overlay_bbox(page)
            page.mouse.click(box["x"] + box["width"] * 0.33, box["y"] + box["height"] * 0.33)
            page.wait_for_selector('.modal h2:has-text("Edit Incident")', timeout=5000)
            page.fill("#pin-change-reason", "QA assigned pin to street incident")
            page.click("button[type=submit]:has-text('Update')")
            page.wait_for_selector('.modal h2:has-text("Edit Incident")', state="detached", timeout=8000)
            inc2 = get_incident(iid2)
            check("6c pin assigned while geographic coords preserved",
                  inc2["floorplan_version_id"] == new_current and inc2["latitude"] is not None and inc2["longitude"] is not None,
                  f"version={inc2['floorplan_version_id']} lat={inc2['latitude']}")

        # ---------- 7. XSS payload rendered escaped ----------
        select_floor(page, "cam level 1", "Level 1 (CAM)")
        page.locator('button[title*="incident on map"], button[title*="map placement"]').click()
        box = overlay_bbox(page)
        page.mouse.click(box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.55)
        page.wait_for_selector('.modal h2:has-text("New Incident")', timeout=5000)
        xss = "<img src=x onerror=alert(1)>"
        page.fill("#room-label", xss)
        page.click("button[type=submit]:has-text('Create')")
        page.wait_for_selector('.modal h2:has-text("New Incident")', state="detached", timeout=8000)
        iid3 = int(psql(f"select id from incidents where room_label='{xss.replace(chr(39), chr(39)*2)}' order by id desc limit 1"))
        page.wait_for_timeout(800)
        # room label renders inside the pin popup — click each pin until one opens with our payload
        popup_html, pin_found = "", False
        pins = page.locator(".floorplan-incident-pin")
        for i in range(pins.count()):
            pins.nth(i).click(force=True)
            page.wait_for_selector(".leaflet-popup-content", timeout=3000)
            html = page.locator(".leaflet-popup-content").inner_html()
            if "onerror=alert" in html:
                popup_html, pin_found = html, True
                break
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
        live_img = page.locator(".leaflet-popup-content img").count() if pin_found else -1
        check("7a XSS payload rendered as escaped text in popup", pin_found and "&lt;img" in popup_html and live_img == 0,
              f"pin_found={pin_found} live_img={live_img} popup={popup_html[:80]}")

        # ---------- 8. archive requires reason and preserves history ----------
        dialogs = []
        def on_dialog(d):
            dialogs.append((d.type, d.message))
            if d.type == "confirm":
                d.accept()
            else:
                d.accept("QA archive test")
        page.on("dialog", on_dialog)
        page.locator(".incident-card", has_text=marker + "-1A").first.locator("button.btn-delete").click()
        page.wait_for_timeout(1500)
        check("8c archive flow asked confirm then prompt", [t for t, _ in dialogs] == ["confirm", "prompt"], str(dialogs))
        inc = get_incident(iid)
        hist = get_history(iid)
        check("8a archive soft-deletes (status archived, identity kept)", inc["status"] == "archived", str(inc))
        check("8b pin history preserved after archive", len(hist) >= 3, f"{len(hist)} rows")

        # ---------- cleanup ----------
        psql(f"delete from incident_floorplan_pin_history where incident_id in ({iid},{iid2},{iid3});")
        psql(f"delete from incidents where id in ({iid},{iid2},{iid3});")
        psql(f"""
          UPDATE floorplans SET current_version_id={v1} WHERE floor_id='cam-l1';
          DELETE FROM floorplan_versions WHERE id={new_current};
        """)
        print("[cleanup] QA rows and version fixture removed")
        browser.close()

    print()
    if FAILURES:
        print(f"RESULT: {len(FAILURES)} FAILURES: " + "; ".join(FAILURES))
        sys.exit(1)
    print("RESULT: ALL CHECKS PASSED")

if __name__ == "__main__":
    main()
