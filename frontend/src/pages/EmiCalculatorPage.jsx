import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import EmiCalculator from "@/components/EmiCalculator";

export default function EmiCalculatorPage() {
  return (
    <div className="App">
      <Header />
      <section className="bg-[#0C1D42] text-[#FCFAF5] py-20">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-12">
          <div className="label-eyebrow text-[#DA9E3E] mb-3">Tools</div>
          <h1 className="font-display text-5xl sm:text-6xl leading-tight">Home Loan EMI Calculator</h1>
          <p className="text-[#FCFAF5]/80 mt-4 max-w-xl">
            Compare interest rates from leading banks. Adjust loan amount, down payment and tenure to see your monthly EMI in seconds.
          </p>
        </div>
      </section>
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12 py-12">
        <EmiCalculator />
      </section>
      <Footer />
    </div>
  );
}
