import { Link } from "react-router-dom";
import { Instagram, Facebook, Twitter, Linkedin } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#333333] text-[#FCFAF5] mt-24">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-4">
          <div className="font-display text-4xl text-[#FCFAF5]">Homesqre</div>
          <div className="hs-divider-gold mt-3 mb-5" />
          {/* Updated description to focus strictly on Boutique Interiors */}
          <p className="text-sm text-[#FCFAF5]/70 leading-relaxed max-w-xs">
            Premium turnkey interior design and 3D architectural rendering. From initial vision to flawless installation, we bring your exact space to life.
          </p>
          <div className="flex gap-3 mt-6">
            {[Instagram, Facebook, Twitter, Linkedin].map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="w-9 h-9 border border-[#FCFAF5]/20 flex items-center justify-center hover:border-[#DA9E3E] hover:text-[#DA9E3E] transition-colors"
                aria-label="social"
              >
                <Icon size={15} strokeWidth={1.5} />
              </a>
            ))}
          </div>
        </div>

        {/* Expanded col-span to 8 to perfectly fill the layout gap */}
        <div className="md:col-span-8">
          <div className="label-eyebrow text-[#DA9E3E] mb-4">Get in touch</div>
          <p className="text-sm text-[#FCFAF5]/70 leading-relaxed">
            Homesqre Technologies Pvt Ltd<br />
            Property No. 224, 3rd Floor, #803, Vijinapura Village
            Old Madras Road, K.R. Puram, Bengaluru-560016<br />
            hello@homesqre.com · +91 97316 55775
          </p>
        </div>
      </div>
      <div className="border-t border-[#FCFAF5]/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-6 flex flex-col md:flex-row justify-between text-xs text-[#FCFAF5]/50 pb-24 md:pb-6">
          <span>© {new Date().getFullYear()} Homesqre Technologies Pvt Ltd. All rights reserved.</span>
          <span>Made in Bengaluru.</span>
        </div>
      </div>
    </footer>
  );
}
