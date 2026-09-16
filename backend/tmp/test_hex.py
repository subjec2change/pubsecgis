from shapely import wkb
from shapely.geometry import Point

geom_hex = '0101000020E61000007EF2BD63F79056C0F86CF3A294514340'
print(f"Length: {len(geom_hex)}")

point = wkb.loads(bytes.fromhex(geom_hex))
print(f"Point type: {type(point)}")
print(f"Point: {point}")
print(f"Is Point: {isinstance(point, Point)}")
print(f"Is empty: {point.is_empty}")
print(f"Y: {point.y}")
print(f"X: {point.x}")
