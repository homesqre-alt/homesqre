import { Link } from "react-router-dom";
import { Instagram, Facebook, Twitter, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#1A2421] text-[#FAF9F6] mt-24">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <div className="font-display text-4xl text-[#FAF9F6]">Homesqre</div>
          <div className="hs-divider-gold mt-3 mb-5" />
          {/* Updated description to focus strictly on Boutique Interiors */}
          <p className="text-sm text-[#FAF9F6]/70 leading-relaxed max-w-xs">
            Premium turnkey interior design and 3D architectural rendering. From initial vision to flawless installation, we bring your exact space to life.
          </p>
          <div className="flex gap-3 mt-6">
            {[Instagram, Facebook, Twitter, Linkedin].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="w-9 h-9 border border-[#FAF9F6]/20 flex items-center justify-center hover:border-[#B68D40] hover:text-[#B68D40] transition-colors"
                aria-label="social"
              >
                <Icon size={15} strokeWidth={1.5} />
              </a>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="label-eyebrow text-[#B68D40] mb-4">Explore</div>
          <ul className="space-y-2 text-sm text-[#FAF9F6]/80">
            {/* 🛑 HIDDEN REAL ESTATE LINKS */}
            {/* <li><Link to="/properties" className="hover:text-[#B68D40]">Buy</Link></li> */}
            {/* <li><Link to="/properties?kind=rent" className="hover:text-[#B68D40]">Rent</Link></li> */}
            {/* <li><Link to="/projects" className="hover:text-[#B68D40]">Projects</Link></li> */}
            <li><Link to="/interiors" className="hover:text-[#B68D40]">Interiors</Link></li>
          </ul>
        </div>

        {/* 🛑 HIDDEN TOOLS COLUMN (Saved for next year) */}
        {/* <div className="md:col-span-2">
          <div className="label-eyebrow text-[#B68D40] mb-4">Tools</div>
          <ul className="space-y-2 text-sm text-[#FAF9F6]/80">
            <li><Link to="/emi-calculator" className="hover:text-[#B68D40]">EMI Calculator</Link></li>
            <li><Link to="/compare" className="hover:text-[#B68D40]">Compare</Link></li>
            <li><Link to="/favourites" className="hover:text-[#B68D40]">Saved</Link></li>
          </ul>
        </div> 
        */}

        {/* Expanded col-span to 6 to perfectly fill the layout gap */}
        <div className="md:col-span-6">
          <div className="label-eyebrow text-[#B68D40] mb-4">Get in touch</div>
          <p className="text-sm text-[#FAF9F6]/70 leading-relaxed">
            Homesqre Technologies Pvt Ltd<br />
            Property No. 224, 3rd Floor, #803, Vijinapura Village
            Old Madras Road, K.R. Puram, Bengaluru-560016<br />
            hello@homesqre.com · +91 97316 55775
          </p>
        </div>
      </div>
      <div className="border-t border-[#FAF9F6]/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-6 flex flex-col md:flex-row justify-between text-xs text-[#FAF9F6]/50 pb-24 md:pb-6">
          <span>© {new Date().getFullYear()} Homesqre Technologies Pvt Ltd. All rights reserved.</span>
          <span>Made in Bengaluru.</span>
        </div>
      </div>
    </footer>
  );
}
