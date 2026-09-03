# PUSECGIS — Research Ledger

## Findings

| # | Finding | Evidence/Source | Confidence | Implication |
|---|---------|-----------------|------------|-------------|
| 1 | Elopement prevention is a **regulated, high-priority** issue in SNFs — CMS tracks it, deficiencies carry penalties | SRCAresolutions, FHCA, MAC Safety sources | High | There's regulatory urgency creating buyer demand |
| 2 | RTLS/Wander management systems exist but are proprietary and facility-bound (PatienTRAK/SecurTRAK, VersaBadge, MAC Safety NIXN) | versabadge.com, mgm-solutions.com, macsafety.com | High | These solve real-time monitoring *inside* a facility but provide no cross-facility geographic analytics |
| 3 | Nursing home management software (PointClickCare, etc.) is EHR/Admin focused — no GIS/spatial capabilities | SourceForge LTC directory, LTCApps | High | The gap between "safety incident data exists" and "can visualize it geographically" is real |
| 4 | CMS has Quality, Safety & Oversight Group (QSOG) that tracks facility compliance — CMS data is publicly available via Care Compare | cms.gov | High | Open public data exists to enrich any tool |
| 5 | Open-source healthcare dashboards exist for CMS hospital quality data (mtournier-apixio/cms_hospital_dashboard) | github.com | Medium | Proof that public health data can be turned into dashboards; but no equivalent for SNF/long-term care incidents |
| 6 | Nursing home software space has free options but they're basic — no analytics layer mentioned | Krowdbase, SoftwareWorld | Medium | If someone built a GIS layer on top of the data flow, it could be add-on value |
| 7 | GIS platforms for public safety exist for crime/disaster (St. Louis County policing) but NOT for healthcare facility safety | stlouiscountymo.gov, search results | High | **No direct competitor** at the intersection of SNF safety incidents + GIS |

## Competitive landscape (revised)

| Category | Players | Gap we could fill |
|----------|---------|-------------------|
| **Facility monitoring (real-time)** | PatienTRAK, VersaBadge, MAC Safety NIXN | They do alerts in-facility but NO geographic/cross-facility analytics |
| **Facility management/EHR** | PointClickCare, CentraState, LTCApps | Clinical + admin, NO GIS/safety incident mapping |
| **CMS compliance** | Quality Improvement organizations, state surveys | Manual/reports, NO interactive geographic visualization |
| **Public GIS** | ArcGIS, QGIS, GeoServer | Generic, no healthcare-safety domain understanding |
| **We could be** | **GIS layer ON TOP of incident data from multiple sources** | Cross-facility spatial analytics for SNF safety incidents |

## Unanswered questions (priority order)

1. **Who is the actual buyer?** Multi-facility operator? Regional health authority? A single small facility admin?
2. **What data can we actually access?** Internal incident reports? CMS deficiency data? State survey data? Staffing data?
3. **Do operators already pay for something that does 80% of this?** (Check if any analytics add-ons exist for PointClickCare, etc.)
4. **How do room sitter, alarm, and elopment alert data flow into any system today?** Is it manual entry or from IoT sensors?
5. **What's the budget reality?** Small facilities run on thin margins — what's realistic pricing?

## Status: Concept corrected. Still early exploration. Buyer persona is the critical next step.
