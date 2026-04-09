'use client';

import { useState } from 'react';
import { sendChat, launchBusiness } from '@/lib/api';

interface AddBusinessModalProps {
  onClose: () => void;
}

interface Audience {
  id: string;
  name: string;
  painPoint: string;
  ageRange: string;
}

const BUSINESS_TYPES = [
  { value: 'solar', label: 'Solar' },
  { value: 'medspa', label: 'Med Spa' },
  { value: 'ecommerce', label: 'E-Commerce' },
  { value: 'saas', label: 'SaaS' },
  { value: 'service', label: 'Service Business' },
  { value: 'custom', label: 'Custom' },
];

const EMAIL_TONES = ['casual', 'professional', 'friendly'];
const DIALER_VOICES = ['male-confident', 'female-professional', 'male-friendly', 'female-warm'];

export default function AddBusinessModal({ onClose }: AddBusinessModalProps) {
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [offer, setOffer] = useState('');
  const [cta, setCta] = useState('');
  const [targetCPL, setTargetCPL] = useState('');
  const [dailyBudget, setDailyBudget] = useState('');
  const [metaAdAccount, setMetaAdAccount] = useState('');
  const [audiences, setAudiences] = useState<Audience[]>([
    { id: '1', name: '', painPoint: '', ageRange: '25-54' },
  ]);
  const [emailTone, setEmailTone] = useState('professional');
  const [dialerVoice, setDialerVoice] = useState('male-confident');
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function addAudience() {
    setAudiences((prev) => [
      ...prev,
      { id: String(Date.now()), name: '', painPoint: '', ageRange: '25-54' },
    ]);
  }

  function removeAudience(id: string) {
    setAudiences((prev) => prev.filter((a) => a.id !== id));
  }

  function updateAudience(id: string, field: keyof Audience, val: string) {
    setAudiences((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: val } : a))
    );
  }

  async function handleCreate() {
    if (!businessName.trim() || !businessType) return;
    setCreating(true);
    setResult(null);

    const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const config = {
      name: businessName,
      type: businessType,
      slug,
      offer,
      cta,
      target_cpl: targetCPL ? parseFloat(targetCPL) : null,
      daily_budget: dailyBudget ? parseFloat(dailyBudget) : null,
      meta_ad_account: metaAdAccount || null,
      audiences: audiences
        .filter((a) => a.name.trim())
        .map((a) => ({
          name: a.name,
          pain_point: a.painPoint,
          age_range: a.ageRange,
        })),
      email_tone: emailTone,
      dialer_voice: dialerVoice,
    };

    const chatRes = await sendChat(
      `Create new business configuration: ${JSON.stringify(config)}`
    );

    const launchRes = await launchBusiness(slug);

    if (launchRes?.success) {
      setResult(`Business "${businessName}" created and room deployed successfully.`);
    } else {
      setResult(chatRes?.reply ?? `Business config saved for "${businessName}". Room will appear on next refresh.`);
    }

    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-auto bg-[#0a0e1a] border rounded-xl shadow-2xl"
        style={{ borderColor: '#69f0ae', boxShadow: '0 0 40px rgba(105, 240, 174, 0.15)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[#1a2744] bg-[#0a0e1a]">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#69f0ae]">Add New Business</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#1a2744] bg-[#0d1424] flex items-center justify-center text-[#6b7fa3] hover:text-[#ff4081] hover:border-[#ff4081] transition-all text-sm"
          >
            X
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-[0.55rem] uppercase tracking-widest text-[#6b7fa3]">
            <span className="text-[#69f0ae]">01</span> Basics
            <span className="text-[#1a2744]">—</span>
            <span className="text-[#69f0ae]">02</span> Targeting
            <span className="text-[#1a2744]">—</span>
            <span className="text-[#69f0ae]">03</span> Audiences
            <span className="text-[#1a2744]">—</span>
            <span className="text-[#69f0ae]">04</span> Comms
          </div>

          {/* 01: Basics */}
          <div className="space-y-3">
            <h3 className="text-[0.65rem] uppercase tracking-wider text-[#69f0ae]">Business Info</h3>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Business name"
              className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
            />
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] focus:outline-none focus:border-[#69f0ae] appearance-none"
            >
              <option value="">Select business type...</option>
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Value proposition (e.g. 'Save 40% on your electric bill with solar')"
              className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
            />
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="CTA text (e.g. 'Get Your Free Quote')"
              className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
            />
          </div>

          {/* 02: Targeting / Budget */}
          <div className="space-y-3">
            <h3 className="text-[0.65rem] uppercase tracking-wider text-[#69f0ae]">Budget & Targeting</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Target CPL ($)</label>
                <input
                  type="number"
                  value={targetCPL}
                  onChange={(e) => setTargetCPL(e.target.value)}
                  placeholder="25"
                  className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
                />
              </div>
              <div>
                <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Daily Ad Budget ($)</label>
                <input
                  type="number"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  placeholder="100"
                  className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Meta Ad Account ID (optional)</label>
              <input
                type="text"
                value={metaAdAccount}
                onChange={(e) => setMetaAdAccount(e.target.value)}
                placeholder="act_123456789"
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
              />
            </div>
          </div>

          {/* 03: Audiences */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[0.65rem] uppercase tracking-wider text-[#69f0ae]">Target Audiences</h3>
              <button
                onClick={addAudience}
                className="px-2 py-1 rounded text-[0.65rem] bg-[#69f0ae]/10 text-[#69f0ae] border border-[#69f0ae]/30 hover:bg-[#69f0ae]/20 transition-all"
              >
                + Add Audience
              </button>
            </div>
            {audiences.map((aud, idx) => (
              <div key={aud.id} className="neon-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[0.55rem] uppercase tracking-wider text-[#6b7fa3]">Audience {idx + 1}</span>
                  {audiences.length > 1 && (
                    <button
                      onClick={() => removeAudience(aud.id)}
                      className="text-[#ff4081] text-[0.65rem] hover:text-[#ff4081]/80"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={aud.name}
                  onChange={(e) => updateAudience(aud.id, 'name', e.target.value)}
                  placeholder="Audience name (e.g. 'Homeowners in CT')"
                  className="w-full bg-[#0a0e1a] border border-[#1a2744] rounded px-2.5 py-1.5 text-xs text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
                />
                <input
                  type="text"
                  value={aud.painPoint}
                  onChange={(e) => updateAudience(aud.id, 'painPoint', e.target.value)}
                  placeholder="Pain point (e.g. 'High electric bills')"
                  className="w-full bg-[#0a0e1a] border border-[#1a2744] rounded px-2.5 py-1.5 text-xs text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#69f0ae]"
                />
                <div>
                  <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Age Range</label>
                  <select
                    value={aud.ageRange}
                    onChange={(e) => updateAudience(aud.id, 'ageRange', e.target.value)}
                    className="w-full bg-[#0a0e1a] border border-[#1a2744] rounded px-2.5 py-1.5 text-xs text-[#c8d6e5] focus:outline-none focus:border-[#69f0ae] appearance-none"
                  >
                    <option value="18-24">18-24</option>
                    <option value="25-34">25-34</option>
                    <option value="25-54">25-54</option>
                    <option value="35-54">35-54</option>
                    <option value="45-65">45-65</option>
                    <option value="55+">55+</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* 04: Communication */}
          <div className="space-y-3">
            <h3 className="text-[0.65rem] uppercase tracking-wider text-[#69f0ae]">Communication Style</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Email Tone</label>
                <div className="flex gap-2">
                  {EMAIL_TONES.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => setEmailTone(tone)}
                      className={`flex-1 py-2 rounded text-[0.65rem] font-medium transition-all ${
                        emailTone === tone
                          ? 'bg-[#69f0ae]/15 text-[#69f0ae] border border-[#69f0ae]/40'
                          : 'bg-[#0d1424] text-[#6b7fa3] border border-[#1a2744] hover:text-[#c8d6e5]'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Dialer Voice</label>
                <select
                  value={dialerVoice}
                  onChange={(e) => setDialerVoice(e.target.value)}
                  className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-xs text-[#c8d6e5] focus:outline-none focus:border-[#69f0ae] appearance-none"
                >
                  {DIALER_VOICES.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="neon-card p-3 text-xs text-[#69f0ae]">
              {result}
            </div>
          )}

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={creating || !businessName.trim() || !businessType}
            className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, rgba(105,240,174,0.15), rgba(0,229,255,0.15))',
              color: '#69f0ae',
              border: '1px solid rgba(105,240,174,0.4)',
              boxShadow: creating ? 'none' : '0 0 20px rgba(105,240,174,0.15)',
            }}
          >
            {creating ? 'Creating...' : 'Create Business'}
          </button>
        </div>
      </div>
    </div>
  );
}
