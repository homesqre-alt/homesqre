"""
Static seed data + content defaults for Homesqre.

Pulled out of server.py so the API file stays focused on routes/logic.
None of this is platform-specific — fully portable.
"""

from typing import Any, Dict, List



DEFAULT_HOMEPAGE_CONTENT: Dict[str, Any] = {
    "hero": {
        "headline": "Find the home that fits your life.",
        "subheadline": "Premium apartments, villas and projects across Bangalore — curated, verified and beautifully presented.",
        "cta": "Start your search",
        "background": "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1600",
    },
    "promo_banner": {"text": "", "show": False, "color": "#06402B"},
    "stats": {"homes": 1240, "agents": 180, "cities": 1, "projects": 65},
}

DEFAULT_INTERIORS_CONTENT: Dict[str, Any] = {
    "hero": {
        "headline": "Interiors that feel like home.",
        "subheadline": "End-to-end home interiors crafted by award-winning designers. 45-day delivery. 10-year warranty.",
        "offer": "Flat 10% off this month",
        "show_offer": True,
        "cta": "Get a Free Design Consultation",
        "backgrounds": [
            "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1600",
            "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600",
        ],
    },
    "how_it_works": [
        {"step": 1, "icon": "message-circle", "title": "Share your vision", "description": "Tell us your style, budget and timelines."},
        {"step": 2, "icon": "pencil-ruler", "title": "Design & 3D walkthrough", "description": "Approve your design with realistic 3D views."},
        {"step": 3, "icon": "hammer", "title": "Production & install", "description": "Built in our factory, installed in 45 days."},
        {"step": 4, "icon": "key-round", "title": "Move in & warranty", "description": "Move in worry-free with a 10-year warranty."},
    ],
    "services": [
        {"icon": "home", "title": "Full Home Interiors", "description": "Turnkey design for every room."},
        {"icon": "chef-hat", "title": "Modular Kitchen", "description": "Functional, beautiful kitchens."},
        {"icon": "shirt", "title": "Wardrobe & Storage", "description": "Custom storage for every space."},
        {"icon": "lamp", "title": "False Ceiling & Lighting", "description": "Layered lighting that elevates."},
        {"icon": "bath", "title": "Bathroom Design", "description": "Spa-grade bathrooms."},
        {"icon": "briefcase", "title": "Home Office", "description": "Workspaces built for focus."},
    ],
    "why_choose_us": [
        {"icon": "calendar-check", "value": "45-Day", "label": "Delivery"},
        {"icon": "shield-check", "value": "10-Year", "label": "Warranty"},
        {"icon": "home", "value": "500+", "label": "Homes Designed"},
        {"icon": "credit-card", "value": "EMI", "label": "Available"},
        {"icon": "palette", "value": "50+", "label": "Design Styles"},
    ],
    "cost_matrix": {
        "1BHK": {"Basic": [350000, 500000], "Standard": [550000, 750000], "Premium": [800000, 1200000]},
        "2BHK": {"Basic": [500000, 750000], "Standard": [800000, 1100000], "Premium": [1200000, 1800000]},
        "3BHK": {"Basic": [750000, 1100000], "Standard": [1200000, 1700000], "Premium": [1800000, 2700000]},
        "4BHK": {"Basic": [1100000, 1500000], "Standard": [1700000, 2400000], "Premium": [2500000, 4000000]},
    },
    "gallery": [
        {"room": "Living Room", "title": "Warm minimal living", "url": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200"},
        {"room": "Kitchen", "title": "Emerald modular", "url": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200"},
        {"room": "Bedroom", "title": "Soft neutrals", "url": "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200"},
        {"room": "Wardrobe", "title": "Walk-in luxury", "url": "https://images.unsplash.com/photo-1558985212-8378e29b0d09?w=1200"},
        {"room": "Bathroom", "title": "Spa retreat", "url": "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200"},
        {"room": "Kids Room", "title": "Playful palette", "url": "https://images.unsplash.com/photo-1617104551722-3b2d51366400?w=1200"},
    ],
    "reviews": [
        {"name": "Anita R.", "flat": "3BHK", "locality": "Whitefield", "rating": 5, "text": "Loved the process — design to delivery was seamless."},
        {"name": "Raghav M.", "flat": "2BHK", "locality": "HSR Layout", "rating": 5, "text": "Quality is genuinely premium. Highly recommend."},
        {"name": "Priya S.", "flat": "4BHK", "locality": "Sarjapur", "rating": 5, "text": "Beautiful work. Our home turned out exactly as we imagined."},
    ],
    "faq": [
        {"q": "How long does it take?", "a": "Typically 45 days from design lock to handover."},
        {"q": "Do you offer EMI?", "a": "Yes — 0% EMI for up to 12 months on select packages."},
        {"q": "Is there a warranty?", "a": "Yes — 10 years on modular, 1 year on services."},
    ],
    "final_cta": {
        "headline": "Ready to design your dream home?",
        "subtext": "Book a free 60-minute consultation with a senior designer.",
        "cta": "Book Free Consultation",
        "background": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1600",
    },
}

DEFAULT_PACKAGES: List[Dict[str, Any]] = [
    {
        "group": "Apartment / Flat",
        "property_type": "apartment",
        "options": [
            {"value": "1-2", "label": "1–2 BHK", "price": 10000, "blurb": "Compact apartments up to 2 bedrooms."},
            {"value": "3", "label": "3 BHK", "price": 12000, "blurb": "Mid-size families. Most popular package."},
            {"value": "4+", "label": "4+ BHK", "price": 15000, "blurb": "Large apartments / penthouse layouts."}
        ]
    },
    {
        "group": "Villa",
        "property_type": "villa",
        "options": [
            {"value": "duplex", "label": "Duplex Villa", "price": 15000, "blurb": "Two-storey independent villa."},
            {"value": "triplex", "label": "Triplex / Luxury", "price": 18000, "blurb": "Three-storey or luxury villa."}
        ]
    },
    {
        "group": "Independent / Rental",
        "property_type": "independent",
        "options": [
            {"value": "1", "label": "1 unit", "price": 12000, "blurb": "Single rental / studio."},
            {"value": "2", "label": "2 units", "price": 20000, "blurb": "Duplex rental."},
            {"value": "3", "label": "3 units", "price": 20000, "blurb": "Triple rental."},
            {"value": "4", "label": "4 units", "price": 24000, "blurb": "Quad rental."},
            {"value": "5", "label": "5 units", "price": 30000, "blurb": "5-unit rental block."}
        ]
    }
]
