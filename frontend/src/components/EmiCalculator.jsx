import { useEffect, useMemo, useState } from "react";
import api, { formatINR, formatApiError } from "@/lib/api";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

export default function EmiCalculator({ initialPrice = 5000000, defaultBank = null, compact = false }) {
  const [banks, setBanks] = useState([]);
  const [bankId, setBankId] = useState("");
  const [loanAmount, setLoanAmount] = useState(initialPrice);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(8.5);
  const [tenure, setTenure] = useState(20);

  useEffect(() => {
    api
      .get("/banks")
      .then(({ data }) => {
        setBanks(data || []);
        const init = defaultBank
          ? data.find((b) => b.bank_id === defaultBank)
          : data[0];
        if (init) {
          setBankId(init.bank_id);
          setRate(((init.rate_min + init.rate_max) / 2).toFixed(2));
        }
      })
      .catch(() => {});
  }, [defaultBank]);

  const principal = useMemo(() => Math.max(0, loanAmount * (1 - downPct / 100)), [loanAmount, downPct]);
  const monthlyRate = Number(rate) / 12 / 100;
  const months = tenure * 12;
  const emi = useMemo(() => {
    if (!principal || !monthlyRate || !months) return 0;
    return (
      (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1)
    );
  }, [principal, monthlyRate, months]);

  const totalPayment = emi * months;
  const totalInterest = totalPayment - principal;

  const onBankChange = (id) => {
    setBankId(id);
    const b = banks.find((x) => x.bank_id === id);
    if (b) setRate(((b.rate_min + b.rate_max) / 2).toFixed(2));
  };

  const saveLead = async () => {
    try {
      await api.post("/loan-leads", {
        loan_amount: principal,
        interest_rate: Number(rate),
        tenure,
        bank: banks.find((b) => b.bank_id === bankId)?.name || "",
        emi: Math.round(emi),
      });
      toast.success("Saved! Our team will get in touch.");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className={`bg-white border border-[#EDE5DB] ${compact ? "p-5" : "p-8"}`}>
      <div className="flex items-baseline justify-between mb-6">
        <h3 className="font-display text-2xl text-[#0C1D42]" data-testid="emi-title">EMI Calculator</h3>
        <span className="label-eyebrow text-[10px]">INR</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="label-eyebrow mb-2 block">Loan Amount</label>
          <input
            type="number"
            value={loanAmount}
            onChange={(e) => setLoanAmount(Number(e.target.value))}
            className="hs-input"
            data-testid="emi-loan-amount"
          />
          <div className="text-xs text-[#333333] mt-1">{formatINR(loanAmount)}</div>
        </div>
        <div>
          <label className="label-eyebrow mb-2 block">Bank</label>
          <select
            value={bankId}
            onChange={(e) => onBankChange(e.target.value)}
            className="hs-input"
            data-testid="emi-bank-select"
          >
            {banks.map((b) => (
              <option key={b.bank_id} value={b.bank_id}>
                {b.name} ({b.rate_min}% – {b.rate_max}%)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-eyebrow mb-2 block">Down Payment: {downPct}%</label>
          <Slider value={[downPct]} min={0} max={50} step={1} onValueChange={(v) => setDownPct(v[0])} />
          <div className="text-xs text-[#333333] mt-1">{formatINR((loanAmount * downPct) / 100)}</div>
        </div>
        <div>
          <label className="label-eyebrow mb-2 block">Tenure: {tenure} yrs</label>
          <Slider value={[tenure]} min={1} max={30} step={1} onValueChange={(v) => setTenure(v[0])} />
          <div className="text-xs text-[#333333] mt-1">Rate: {rate}% p.a.</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[#EDE5DB]">
        <div>
          <div className="label-eyebrow mb-1">Monthly EMI</div>
          <div className="font-display text-2xl text-[#0C1D42]" data-testid="emi-monthly">
            {formatINR(Math.round(emi))}
          </div>
        </div>
        <div>
          <div className="label-eyebrow mb-1">Interest</div>
          <div className="font-display text-2xl text-[#0C1D42]">{formatINR(Math.round(totalInterest))}</div>
        </div>
        <div>
          <div className="label-eyebrow mb-1">Total</div>
          <div className="font-display text-2xl text-[#0C1D42]">{formatINR(Math.round(totalPayment))}</div>
        </div>
      </div>

      <button onClick={saveLead} className="btn-primary w-full mt-6 justify-center" data-testid="emi-save-btn">
        Get Best Loan Offers
      </button>
    </div>
  );
}
