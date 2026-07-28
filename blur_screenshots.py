#!/usr/bin/env python3
"""
Blur sensitive data regions in portfolio screenshots.
"""

from PIL import Image, ImageFilter
import os

BASE = "/home/flux1a/.gemini/antigravity/brain/1b5cf952-be2e-438b-b3e0-87f81ad13496"
OUT = os.path.join(BASE, "blurred")
os.makedirs(OUT, exist_ok=True)

def blur_region(img, box, radius=20):
    """Blur a rectangular region of an image. box = (x1, y1, x2, y2)"""
    region = img.crop(box)
    blurred = region.filter(ImageFilter.GaussianBlur(radius=radius))
    img.paste(blurred, box)
    return img

# ========== DASHBOARD ==========
img = Image.open(f"{BASE}/ss_dashboard_1785266242030.png")
w, h = img.size
# Sidebar: nombres de empresas (columna izquierda completa)
img = blur_region(img, (0, 55, 245, 410))
# Email del usuario (abajo izquierda)
img = blur_region(img, (0, 590, 245, h))
# KPI amounts (ingresos, gastos, beneficio, IVA)
img = blur_region(img, (300, 200, 870, 340))
# Resultado IVA value
img = blur_region(img, (900, 200, 1100, 310))
img.save(f"{OUT}/dashboard.png")
print("✅ dashboard.png")

# ========== DOCUMENTS ==========
img = Image.open(f"{BASE}/ss_documents_1785266294508.png")
# Sidebar empresas
img = blur_region(img, (0, 55, 245, 410))
# Email usuario
img = blur_region(img, (0, 590, 245, h))
# Client/company names in table rows
img = blur_region(img, (750, 415, 1150, h))
# Proveedor column right side
img = blur_region(img, (1150, 415, w, h))
img.save(f"{OUT}/documents.png")
print("✅ documents.png")

# ========== TRIMESTRES ==========
img = Image.open(f"{BASE}/scratch_ss_trimestres_1785266265074.png") if os.path.exists(f"{BASE}/scratch_ss_trimestres_1785266265074.png") else Image.open(f"{BASE}/ss_trimestres_1785266265074.png") if os.path.exists(f"{BASE}/ss_trimestres_1785266265074.png") else None

# Try alternate filename
img = None
for fn in sorted(os.listdir(BASE)):
    if 'trimestre' in fn.lower():
        img = Image.open(os.path.join(BASE, fn))
        print(f"  Using trimestres file: {fn}")
        break

if img is not None:
    w, h = img.size
    # Sidebar empresas
    img = blur_region(img, (0, 55, 245, 410))
    # Email usuario
    img = blur_region(img, (0, 590, 245, h))
    # KPI cards amounts
    img = blur_region(img, (440, 270, 800, 350))
    img.save(f"{OUT}/trimestres.png")
    print("✅ trimestres.png")
else:
    print("⚠️  trimestres not found")

# ========== INCIDENTS ==========
img = Image.open(f"{BASE}/ss_incidents_1785266326595.png")
w, h = img.size
# Sidebar empresas
img = blur_region(img, (0, 55, 245, 410))
# Email usuario
img = blur_region(img, (0, 590, 245, h))
img.save(f"{OUT}/incidents.png")
print("✅ incidents.png")

# ========== PROVEEDORES ==========
img = Image.open(f"{BASE}/ss_proveedores_1785266353010.png")
w, h = img.size
# Sidebar empresas
img = blur_region(img, (0, 55, 245, 410))
# Email usuario
img = blur_region(img, (0, 590, 245, h))
img.save(f"{OUT}/proveedores.png")
print("✅ proveedores.png")

# ========== SII ==========
img = Image.open(f"{BASE}/ss_sii_1785266388296.png")
img.save(f"{OUT}/sii.png")
print("✅ sii.png")

# ========== HOME ==========
img = Image.open(f"{BASE}/ss_home_1785266417200.png")
img.save(f"{OUT}/home.png")
print("✅ home.png")

print(f"\n📁 All blurred images saved to: {OUT}")
