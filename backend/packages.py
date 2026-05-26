"""Canonical Homesqre Interiors package pricing.

Owned by the backend so the designer cannot enter a custom amount. The
customer-dashboard checkout calculator must stay in sync with these numbers.
"""
from typing import Any


PACKAGE_OPTIONS = {
    "apartment":   [{"value": "1-2", "label": "1–2 BHK", "price": 10000},
                    {"value": "3",   "label": "3 BHK",   "price": 12000},
                    {"value": "4+",  "label": "4+ BHK",  "price": 15000}],
    "villa":       [{"value": "duplex",  "label": "Duplex",  "price": 15000},
                    {"value": "triplex", "label": "Triplex", "price": 18000}],
    "independent": [{"value": "1", "label": "1 unit (Rental/Independent)", "price": 12000},
                    {"value": "2", "label": "2 units", "price": 20000},
                    {"value": "3", "label": "3 units", "price": 20000},
                    {"value": "4", "label": "4 units", "price": 24000},
                    {"value": "5", "label": "5 units", "price": 30000}],
}


def calculate_package_price(property_type: str, bhk_or_units: Any) -> int:
    pt = (property_type or "").strip().lower()
    spec = str(bhk_or_units or "").strip().lower()
    if pt == "apartment":
        if spec in ("1-2", "1", "2", "1bhk", "2bhk"):
            return 10000
        if spec in ("3", "3bhk"):
            return 12000
        if spec in ("4+", "4", "4bhk", "5", "5bhk"):
            return 15000
        return 0
    if pt == "villa":
        if spec in ("duplex",):
            return 15000
        if spec in ("triplex",):
            return 18000
        return 0
    if pt == "independent":
        try:
            n = int(spec)
        except (TypeError, ValueError):
            return 0
        if n <= 1:
            return 12000
        return max(20000, 6000 * n)
    return 0
