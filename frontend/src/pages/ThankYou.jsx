import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { CheckCircle2 } from "lucide-react";

export default function ThankYou() {
  return (
    <div className="App flex flex-col min-h-screen">
      <Header />
      <main className="flex-1 flex items-center justify-center bg-[#FCFAF5] py-24">
        <div className="max-w-md w-full px-6 text-center">
          <div className="flex justify-center mb-6">
            <CheckCircle2 size={64} className="text-[#DA9E3E]" />
          </div>
          <h1 className="font-display text-4xl text-[#0C1D42] mb-4">
            Thank You!
          </h1>
          <p className="text-[#333333] mb-8 leading-relaxed">
            Your inquiry has been successfully sent. A member of our sales team will contact you shortly to assist with your request.
          </p>
          <div className="space-y-4">
            <Link to="/" className="btn-gold w-full justify-center">
              RETURN HOME
            </Link>
            <Link to="/interiors" className="block text-sm text-[#DA9E3E] font-semibold tracking-widest uppercase hover:underline">
              BROWSE INTERIORS
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
