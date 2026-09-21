import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

type View = 'login' | 'register' | 'landing' | 'dashboard' | 'scan' | 'scanning' | 'results' | 'necessity' | 'redact' | 'comparison' | 'score' | 'report'

interface PiiItem {
  id: string
  type: string
  value: string
  masked: string
  risk: 'high' | 'medium' | 'low'
  confidence: number
  purpose: string
  necessity: string
  recommendation: string
  action: 'keep' | 'mask' | 'remove'
  location: string
}

interface ChatMessage {
  role: 'user' | 'ai'
  text: string
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  'English', 'हिन्दी', 'मराठी', 'ગુજરાતી', 'বাংলা',
  'தமிழ்', 'తెలుగు', 'ಕನ್ನಡ', 'മലയാളം', 'ਪੰਜਾਬੀ', 'اردو'
]

const INITIAL_PII: PiiItem[] = [
  {
    id: 'p1', type: 'Aadhaar Number', value: '3821 5674 9012', masked: 'XXXX XXXX 9012',
    risk: 'high', confidence: 98, purpose: 'Identity Verification',
    necessity: 'Possibly Required', recommendation: 'Mask first 8 digits — last 4 sufficient for verification.',
    action: 'mask', location: 'Page 1, Line 4'
  },
  {
    id: 'p2', type: 'PAN Number', value: 'ABCDE1234F', masked: 'XXXXX1234X',
    risk: 'high', confidence: 97, purpose: 'Tax Identification',
    necessity: 'Required', recommendation: 'Mask alpha prefix — numeric portion identifies filing.',
    action: 'mask', location: 'Page 1, Line 6'
  },
  {
    id: 'p3', type: 'Full Name', value: 'Ananya Krishnamurthy', masked: 'A. Krishnamurthy',
    risk: 'low', confidence: 99, purpose: 'Identification',
    necessity: 'Required', recommendation: 'Name is necessary for identification purposes.',
    action: 'keep', location: 'Page 1, Line 1'
  },
  {
    id: 'p4', type: 'Date of Birth', value: '14 March 1992', masked: 'March 1992',
    risk: 'medium', confidence: 96, purpose: 'Age Verification',
    necessity: 'Partially Required', recommendation: 'Month and year may be sufficient — exact day increases re-identification risk.',
    action: 'mask', location: 'Page 1, Line 5'
  },
  {
    id: 'p5', type: 'Mobile Number', value: '+91 98345 67812', masked: 'XXXXXX7812',
    risk: 'high', confidence: 95, purpose: 'Contact',
    necessity: 'Optional', recommendation: 'Phone number rarely necessary in document records — consider removal.',
    action: 'remove', location: 'Page 2, Line 2'
  },
  {
    id: 'p6', type: 'Residential Address', value: '42, Shivaji Nagar, Pune 411004', masked: 'Pune, Maharashtra',
    risk: 'medium', confidence: 91, purpose: 'Location Verification',
    necessity: 'Partially Required', recommendation: 'District/state level granularity usually sufficient.',
    action: 'mask', location: 'Page 2, Line 5'
  },
  {
    id: 'p7', type: 'Email Address', value: 'ananya.k@mailbox.in', masked: 'a*****k@mailbox.in',
    risk: 'medium', confidence: 94, purpose: 'Communication',
    necessity: 'Optional', recommendation: 'Email not typically required in official documents.',
    action: 'remove', location: 'Page 2, Line 3'
  },
]

const AI_RESPONSES: Record<string, string> = {
  "What PII was detected?": "I found 7 types of sensitive information in your document: Aadhaar Number (HIGH risk), PAN Number (HIGH risk), Mobile Number (HIGH risk), Date of Birth (MEDIUM), Address (MEDIUM), Email (MEDIUM), and Full Name (LOW). The Aadhaar and PAN numbers are your most critical exposure — I recommend masking both immediately.",
  "What should I redact?": "Based on my analysis, I strongly recommend: **Mask** the Aadhaar (keep last 4 digits only), **Mask** the PAN prefix, **Remove** the mobile number and email entirely, and **Partially mask** the address to district level. Your full name and organization details can stay — they're typically required for document validity.",
  "Is this information necessary?": "For most compliance use cases: the full Aadhaar number is NOT necessary — last 4 digits suffice. PAN is needed for tax purposes but the alpha prefix can be masked. Mobile and email are almost never legally required in formal documents. Date of birth (month + year only) is usually sufficient for age verification.",
  "Explain the risk": "Your document currently scores **82/100 risk** — HIGH. The exposed Aadhaar number alone can be used for identity fraud, SIM swapping, and financial account access. The combination of Aadhaar + PAN + DOB + Address creates a complete identity profile that's extremely valuable to bad actors. After applying my recommended redactions, your score drops to **18/100** — SAFE.",
}

const QUICK_REPLIES = ["What PII was detected?", "What should I redact?", "Is this information necessary?", "Explain the risk"]

// ─── Auth Pages ─────────────────────────────────────────────────────────────

function AuthShield() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <path d="M24 4 L40 11 L40 26 Q40 37 24 44 Q8 37 8 26 L8 11 Z"
        fill="url(#as-fill)" stroke="url(#as-stroke)" strokeWidth="1.8"/>
      <path d="M16 24 L21 29 L32 18" stroke="#C9982A" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="as-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3D1F0A"/>
          <stop offset="100%" stopColor="#5C2E12"/>
        </linearGradient>
        <linearGradient id="as-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C9982A"/>
          <stop offset="100%" stopColor="#A67C1A"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function AuthBackground() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" fill="none">
      <defs>
        <radialGradient id="rg1" cx="20%" cy="20%" r="60%">
          <stop offset="0%" stopColor="#C9982A" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#C9982A" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="rg2" cx="80%" cy="80%" r="60%">
          <stop offset="0%" stopColor="#3D1F0A" stopOpacity="0.22"/>
          <stop offset="100%" stopColor="#3D1F0A" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="160" cy="160" rx="320" ry="280" fill="url(#rg1)"/>
      <ellipse cx="640" cy="740" rx="320" ry="280" fill="url(#rg2)"/>
      {/* Dot grid */}
      {Array.from({ length: 20 }, (_, row) =>
        Array.from({ length: 14 }, (_, col) => (
          <circle key={`${row}-${col}`} cx={col * 60 + 30} cy={row * 48 + 24}
            r="1.4" fill="#C9982A" opacity="0.18"/>
        ))
      )}
      {/* Corner lines */}
      <path d="M0 0 L80 0 L80 80" stroke="#C9982A" strokeWidth="1.5" strokeOpacity="0.25" fill="none"/>
      <path d="M800 900 L720 900 L720 820" stroke="#C9982A" strokeWidth="1.5" strokeOpacity="0.25" fill="none"/>
    </svg>
  )
}

interface AuthInputProps {
  label: string
  type: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  icon: React.ReactNode
  error?: string
}

function AuthInput({ label, type, placeholder, value, onChange, icon, error }: AuthInputProps) {
  const [focused, setFocused] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const isPassword = type === 'password'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#3D1F0A', fontFamily: "'Inter',sans-serif" }}>
        {label}
      </label>
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        border: `1.5px solid ${error ? '#DC2626' : focused ? '#C9982A' : 'rgba(61,31,10,0.15)'}`,
        borderRadius: 12, background: focused ? 'rgba(201,152,42,0.04)' : '#FDFAF5',
        transition: 'all 0.18s ease',
        boxShadow: focused ? '0 0 0 3px rgba(201,152,42,0.12)' : 'none',
      }}>
        <span style={{ position: 'absolute', left: 14, color: focused ? '#C9982A' : '#7A5C3E',
          transition: 'color 0.18s', display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
        <input
          type={isPassword && showPass ? 'text' : type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', padding: '13px 14px 13px 42px',
            paddingRight: isPassword ? 44 : 14,
            fontSize: 14, border: 'none', outline: 'none',
            background: 'transparent', color: '#1A0F07',
            fontFamily: "'Inter',sans-serif", borderRadius: 12,
          }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPass(p => !p)}
            style={{ position: 'absolute', right: 12, background: 'none', border: 'none',
              cursor: 'pointer', color: '#7A5C3E', display: 'flex', alignItems: 'center', padding: 2 }}>
            {showPass
              ? <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M2 8.5 Q5 4 8.5 4 Q12 4 15 8.5 Q12 13 8.5 13 Q5 13 2 8.5Z" stroke="currentColor" strokeWidth="1.4" fill="none"/><circle cx="8.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.4"/><path d="M2 2 L15 15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
              : <svg width="17" height="17" viewBox="0 0 17 17" fill="none"><path d="M2 8.5 Q5 4 8.5 4 Q12 4 15 8.5 Q12 13 8.5 13 Q5 13 2 8.5Z" stroke="currentColor" strokeWidth="1.4" fill="none"/><circle cx="8.5" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.4"/></svg>
            }
          </button>
        )}
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: '#DC2626', fontFamily: "'Inter',sans-serif" }}>{error}</p>}
    </div>
  )
}

function LoginPage({ navigate }: { navigate: (v: View) => void }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [shake, setShake]       = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!email)    e.email    = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email address'
    if (!password) e.password = 'Password is required'
    else if (password.length < 6) e.password = 'Password must be at least 6 characters'
    return e
  }

  const handleLogin = () => {
    const e = validate()
    if (Object.keys(e).length) {
      setErrors(e)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      return
    }
    setErrors({})
    setLoading(true)
    // Simulate auth — any valid-format credentials work
    setTimeout(() => {
      setLoading(false)
      navigate('landing')
    }, 1400)
  }

  const handleDemo = () => {
    setEmail('demo@piisafe.in')
    setPassword('demo1234')
    setLoading(true)
    setTimeout(() => { setLoading(false); navigate('landing') }, 1000)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(145deg,#FAF7F2 0%,#F0E8D8 55%,#E5D9C0 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      <AuthBackground/>

      <div style={{
        position: 'relative', zIndex: 10, width: '100%', maxWidth: 440,
        margin: '0 auto', padding: '0 20px',
        animation: shake ? 'none' : undefined,
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(201,152,42,0.2)',
          borderRadius: 24, padding: '40px 36px',
          boxShadow: '0 24px 64px rgba(61,31,10,0.12)',
          ...(shake ? { animation: 'authShake 0.4s ease' } : {}),
        }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 60, height: 60, borderRadius: 18, marginBottom: 14,
              background: 'linear-gradient(135deg,#3D1F0A,#5C2E12)',
              boxShadow: '0 8px 24px rgba(61,31,10,0.25)' }}>
              <AuthShield/>
            </div>
            <h1 className="font-display" style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 700, color: '#3D1F0A' }}>
              Welcome back
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: '#7A5C3E', fontFamily: "'Inter',sans-serif" }}>
              Sign in to your PiiSafe account
            </p>
          </div>

          {/* Social / quick login */}
          <button onClick={handleDemo} style={{
            width: '100%', padding: '11px 0', borderRadius: 12, marginBottom: 20,
            border: '1.5px solid rgba(61,31,10,0.15)', background: '#FDFAF5',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 14, fontWeight: 600, color: '#3D1F0A', cursor: 'pointer',
            fontFamily: "'Inter',sans-serif", transition: 'all 0.18s ease',
          }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F0E8D8' }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FDFAF5' }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            Continue with Demo Account
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(61,31,10,0.1)' }}/>
            <span style={{ fontSize: 12, color: '#7A5C3E', fontFamily: "'Inter',sans-serif" }}>or sign in with email</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(61,31,10,0.1)' }}/>
          </div>

          {/* Form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AuthInput label="Email Address" type="email" placeholder="you@organisation.in"
              value={email} onChange={setEmail} error={errors.email}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M1 5.5 L8 9.5 L15 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
            />
            <AuthInput label="Password" type="password" placeholder="Enter your password"
              value={password} onChange={setPassword} error={errors.password}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 7 L5 4.5 Q5 2 8 2 Q11 2 11 4.5 L11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="10.5" r="1.2" fill="currentColor"/></svg>}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6 }}>
              <button style={{ background: 'none', border: 'none', fontSize: 13, color: '#C9982A',
                cursor: 'pointer', fontWeight: 600, fontFamily: "'Inter',sans-serif" }}>
                Forgot password?
              </button>
            </div>

            <button onClick={handleLogin} disabled={loading} style={{
              width: '100%', padding: '14px 0', borderRadius: 13, border: 'none',
              background: loading ? '#7A5C3E' : 'linear-gradient(135deg,#3D1F0A,#5C2E12)',
              color: '#FAF7F2', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter',sans-serif", boxShadow: '0 6px 20px rgba(61,31,10,0.28)',
              transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading
                ? <><span style={{ width: 17, height: 17, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#C9982A',
                    borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }}/> Signing in…</>
                : <>Sign In <span style={{ color: '#C9982A' }}>→</span></>
              }
            </button>
          </div>

          {/* Footer */}
          <p style={{ margin: '22px 0 0', textAlign: 'center', fontSize: 13.5, color: '#7A5C3E',
            fontFamily: "'Inter',sans-serif" }}>
            Don't have an account?{' '}
            <button onClick={() => navigate('register')} style={{
              background: 'none', border: 'none', color: '#C9982A', fontWeight: 700,
              fontSize: 13.5, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
            }}>Create account</button>
          </p>
        </div>

        {/* Trust badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20 }}>
          {['🔒 AES-256 Encrypted', '🛡️ DPDP Compliant', '✓ SOC 2 Ready'].map(b => (
            <span key={b} style={{ fontSize: 11.5, color: '#7A5C3E', fontFamily: "'Inter',sans-serif",
              display: 'flex', alignItems: 'center', gap: 4 }}>{b}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function RegisterPage({ navigate }: { navigate: (v: View) => void }) {
  const [name, setName]           = useState('')
  const [org, setOrg]             = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [agree, setAgree]         = useState(false)
  const [loading, setLoading]     = useState(false)
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [strength, setStrength]   = useState(0)

  useEffect(() => {
    let s = 0
    if (password.length >= 8)    s++
    if (/[A-Z]/.test(password))  s++
    if (/[0-9]/.test(password))  s++
    if (/[^a-zA-Z0-9]/.test(password)) s++
    setStrength(s)
  }, [password])

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const strengthColor = ['', '#DC2626', '#D97706', '#16A34A', '#16A34A'][strength]

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Full name is required'
    if (!email || !/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email'
    if (password.length < 8) e.password = 'Password must be at least 8 characters'
    if (password !== confirm) e.confirm = 'Passwords do not match'
    if (!agree) e.agree = 'Please accept the terms to continue'
    return e
  }

  const handleRegister = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setLoading(true)
    setTimeout(() => { setLoading(false); navigate('landing') }, 1600)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(145deg,#FAF7F2 0%,#F0E8D8 55%,#E5D9C0 100%)',
      position: 'relative', overflow: 'hidden', padding: '32px 0',
    }}>
      <AuthBackground/>

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 460, padding: '0 20px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(201,152,42,0.2)',
          borderRadius: 24, padding: '36px 36px',
          boxShadow: '0 24px 64px rgba(61,31,10,0.12)',
        }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 54, height: 54, borderRadius: 16, marginBottom: 12,
              background: 'linear-gradient(135deg,#3D1F0A,#5C2E12)',
              boxShadow: '0 6px 20px rgba(61,31,10,0.25)' }}>
              <AuthShield/>
            </div>
            <h1 className="font-display" style={{ margin: '0 0 5px', fontSize: 24, fontWeight: 700, color: '#3D1F0A' }}>
              Create your account
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, color: '#7A5C3E', fontFamily: "'Inter',sans-serif" }}>
              Start protecting sensitive data in minutes
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <AuthInput label="Full Name" type="text" placeholder="Ananya Krishnamurthy"
                value={name} onChange={setName} error={errors.name}
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M2 14 Q2 10 8 10 Q14 10 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
              />
              <AuthInput label="Organisation" type="text" placeholder="Ministry / Dept."
                value={org} onChange={setOrg}
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="6" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5 6 L5 4 Q5 2 8 2 Q11 2 11 4 L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
              />
            </div>

            <AuthInput label="Email Address" type="email" placeholder="you@organisation.gov.in"
              value={email} onChange={setEmail} error={errors.email}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M1 5.5 L8 9.5 L15 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
            />

            <div>
              <AuthInput label="Password" type="password" placeholder="Create a strong password"
                value={password} onChange={setPassword} error={errors.password}
                icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 7 L5 4.5 Q5 2 8 2 Q11 2 11 4.5 L11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="10.5" r="1.2" fill="currentColor"/></svg>}
              />
              {password && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex: 1, height: 3, borderRadius: 99,
                        background: i <= strength ? strengthColor : 'rgba(61,31,10,0.12)',
                        transition: 'background 0.25s' }}/>
                    ))}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: strengthColor,
                    fontFamily: "'Inter',sans-serif", minWidth: 36 }}>{strengthLabel}</span>
                </div>
              )}
            </div>

            <AuthInput label="Confirm Password" type="password" placeholder="Repeat your password"
              value={confirm} onChange={setConfirm} error={errors.confirm}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8 L7 11 L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/></svg>}
            />

            {/* Terms */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div
                onClick={() => setAgree(p => !p)}
                style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, cursor: 'pointer',
                  border: `2px solid ${agree ? '#C9982A' : errors.agree ? '#DC2626' : 'rgba(61,31,10,0.25)'}`,
                  background: agree ? '#C9982A' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}>
                {agree && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5 L4 7.5 L8.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#7A5C3E', fontFamily: "'Inter',sans-serif", lineHeight: 1.55 }}>
                I agree to PiiSafe's{' '}
                <span style={{ color: '#C9982A', fontWeight: 600, cursor: 'pointer' }}>Terms of Service</span> and{' '}
                <span style={{ color: '#C9982A', fontWeight: 600, cursor: 'pointer' }}>Privacy Policy</span>
              </p>
            </div>
            {errors.agree && <p style={{ margin: '-8px 0 0', fontSize: 12, color: '#DC2626', fontFamily: "'Inter',sans-serif" }}>{errors.agree}</p>}

            <button onClick={handleRegister} disabled={loading} style={{
              width: '100%', padding: '14px 0', borderRadius: 13, border: 'none',
              background: loading ? '#7A5C3E' : 'linear-gradient(135deg,#3D1F0A,#5C2E12)',
              color: '#FAF7F2', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Inter',sans-serif", boxShadow: '0 6px 20px rgba(61,31,10,0.28)',
              transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading
                ? <><span style={{ width: 17, height: 17, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#C9982A',
                    borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }}/> Creating account…</>
                : <>Create Account <span style={{ color: '#C9982A' }}>→</span></>
              }
            </button>
          </div>

          <p style={{ margin: '18px 0 0', textAlign: 'center', fontSize: 13.5, color: '#7A5C3E',
            fontFamily: "'Inter',sans-serif" }}>
            Already have an account?{' '}
            <button onClick={() => navigate('login')} style={{
              background: 'none', border: 'none', color: '#C9982A', fontWeight: 700,
              fontSize: 13.5, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
            }}>Sign in</button>
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── SVG Illustrations ──────────────────────────────────────────────────────

function HeroIllustration() {
  return (
    <svg viewBox="0 0 420 380" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full animate-float">
      {/* Background glow */}
      <ellipse cx="210" cy="200" rx="160" ry="130" fill="url(#bg-glow)" />

      {/* Shield base */}
      <path d="M210 60 L310 100 L310 200 Q310 270 210 310 Q110 270 110 200 L110 100 Z" fill="url(#shield-fill)" stroke="url(#shield-stroke)" strokeWidth="2"/>
      <path d="M210 80 L295 114 L295 200 Q295 258 210 293 Q125 258 125 200 L125 114 Z" fill="url(#shield-inner)" opacity="0.6"/>

      {/* Document */}
      <rect x="170" y="130" width="80" height="100" rx="6" fill="white" stroke="#C9982A" strokeWidth="1.5"/>
      <rect x="180" y="145" width="60" height="6" rx="3" fill="#EDE4D3"/>
      <rect x="180" y="157" width="45" height="5" rx="2.5" fill="#EDE4D3"/>
      <rect x="180" y="168" width="55" height="5" rx="2.5" fill="#EDE4D3"/>
      {/* Redacted lines */}
      <rect x="180" y="180" width="40" height="5" rx="2.5" fill="#3D1F0A" opacity="0.8"/>
      <rect x="180" y="191" width="50" height="5" rx="2.5" fill="#3D1F0A" opacity="0.8"/>
      <rect x="180" y="202" width="35" height="5" rx="2.5" fill="#C9982A" opacity="0.7"/>

      {/* AI scan line */}
      <line x1="162" y1="175" x2="258" y2="175" stroke="#C9982A" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.9">
        <animateTransform attributeName="transform" type="translate" values="0 -30; 0 60; 0 -30" dur="2.4s" repeatCount="indefinite"/>
      </line>

      {/* Lock icon */}
      <rect x="199" y="252" width="22" height="18" rx="4" fill="#3D1F0A"/>
      <path d="M203 252 Q203 244 210 244 Q217 244 217 252" stroke="#3D1F0A" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <circle cx="210" cy="261" r="3" fill="#C9982A"/>

      {/* Floating badges */}
      <g transform="translate(55, 150)">
        <rect width="72" height="26" rx="13" fill="#3D1F0A" opacity="0.9"/>
        <circle cx="13" cy="13" r="5" fill="#EF4444"/>
        <rect x="24" y="9" width="38" height="4" rx="2" fill="white" opacity="0.8"/>
        <rect x="24" y="16" width="25" height="3" rx="1.5" fill="white" opacity="0.5"/>
      </g>
      <g transform="translate(290, 170)">
        <rect width="72" height="26" rx="13" fill="#3D1F0A" opacity="0.9"/>
        <circle cx="13" cy="13" r="5" fill="#22C55E"/>
        <rect x="24" y="9" width="38" height="4" rx="2" fill="white" opacity="0.8"/>
        <rect x="24" y="16" width="28" height="3" rx="1.5" fill="white" opacity="0.5"/>
      </g>
      <g transform="translate(70, 220)">
        <rect width="72" height="26" rx="13" fill="#C9982A" opacity="0.9"/>
        <circle cx="13" cy="13" r="5" fill="white" opacity="0.9"/>
        <rect x="24" y="9" width="38" height="4" rx="2" fill="white" opacity="0.8"/>
        <rect x="24" y="16" width="20" height="3" rx="1.5" fill="white" opacity="0.5"/>
      </g>

      {/* Orbit dots */}
      <circle cx="210" cy="55" r="5" fill="#C9982A" opacity="0.7">
        <animateTransform attributeName="transform" type="rotate" values="0 210 190; 360 210 190" dur="6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="330" cy="190" r="4" fill="#3D1F0A" opacity="0.5">
        <animateTransform attributeName="transform" type="rotate" values="120 210 190; 480 210 190" dur="6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="90" cy="190" r="3" fill="#C9982A" opacity="0.4">
        <animateTransform attributeName="transform" type="rotate" values="240 210 190; 600 210 190" dur="6s" repeatCount="indefinite"/>
      </circle>

      <defs>
        <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C9982A" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="#C9982A" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="shield-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FAF7F2"/>
          <stop offset="100%" stopColor="#F0E8D8"/>
        </linearGradient>
        <linearGradient id="shield-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C9982A"/>
          <stop offset="100%" stopColor="#A67C1A"/>
        </linearGradient>
        <linearGradient id="shield-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C9982A" stopOpacity="0.08"/>
          <stop offset="100%" stopColor="#3D1F0A" stopOpacity="0.04"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function ScanIllustration() {
  return (
    <svg viewBox="0 0 240 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full animate-float">
      <rect x="50" y="20" width="140" height="180" rx="10" fill="white" stroke="#EDE4D3" strokeWidth="1.5"/>
      <rect x="65" y="38" width="110" height="8" rx="4" fill="#EDE4D3"/>
      <rect x="65" y="52" width="80" height="6" rx="3" fill="#EDE4D3"/>
      <rect x="65" y="64" width="95" height="6" rx="3" fill="#EDE4D3"/>
      <rect x="65" y="78" width="70" height="6" rx="3" fill="#3D1F0A" opacity="0.7"/>
      <rect x="65" y="90" width="100" height="6" rx="3" fill="#3D1F0A" opacity="0.7"/>
      <rect x="65" y="104" width="85" height="6" rx="3" fill="#EDE4D3"/>
      <rect x="65" y="116" width="75" height="6" rx="3" fill="#C9982A" opacity="0.6"/>
      <rect x="65" y="130" width="90" height="6" rx="3" fill="#EDE4D3"/>
      <rect x="65" y="144" width="60" height="6" rx="3" fill="#3D1F0A" opacity="0.5"/>
      <line x1="42" y1="110" x2="198" y2="110" stroke="#C9982A" strokeWidth="2" strokeDasharray="6 3" className="animate-scan-line" opacity="0.9"/>
      <defs>
        <filter id="scan-glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
    </svg>
  )
}

function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = (size - 20) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score > 60 ? '#EF4444' : score > 30 ? '#F59E0B' : '#22C55E'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EDE4D3" strokeWidth="10"/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}/>
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize={size * 0.18}
        fontWeight="700" fill={color} fontFamily="JetBrains Mono, monospace">{score}</text>
      <text x="50%" y="68%" textAnchor="middle" fontSize={size * 0.09} fill="#7A5C3E" fontFamily="Inter, sans-serif">/ 100</text>
    </svg>
  )
}

// ─── Components ─────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    low: 'bg-green-50 text-green-700 border-green-200',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border font-mono-data ${styles[risk]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${risk === 'high' ? 'bg-red-500' : risk === 'medium' ? 'bg-amber-500' : 'bg-green-500'}`}/>
      {risk.toUpperCase()}
    </span>
  )
}

function ActionButton({ action, onClick, active }: { action: string; onClick: () => void; active?: boolean }) {
  const styles: Record<string, string> = {
    keep: active ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100',
    mask: active ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    remove: active ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100',
  }
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${styles[action] || 'bg-muted text-muted-foreground hover:bg-secondary'}`}>
      {action.charAt(0).toUpperCase() + action.slice(1)}
    </button>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('login')
  const [lang, setLang] = useState('English')
  const [langOpen, setLangOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'ai', text: "Hi! I can help you detect, understand and protect sensitive information in your documents. Ask me anything about PII and privacy." }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatTyping, setChatTyping] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanItems, setScanItems] = useState<string[]>([])
  const [piiItems, setPiiItems] = useState<PiiItem[]>(INITIAL_PII)
  const [sliderPos, setSliderPos] = useState(50)
  const [privacyScore, setPrivacyScore] = useState(82)
  const [dragOver, setDragOver] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const navigate = (v: View) => { setView(v); window.scrollTo(0, 0) }

  const allowedFileTypes = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.txt,.csv'
  const handleFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter(file =>
      /\.(pdf|jpe?g|png|docx?|txt|csv)$/i.test(file.name)
    )
    if (incoming.length > 0) {
      setSelectedFiles(incoming)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files)
    e.target.value = ''
  }

  const startScan = () => {
    if (selectedFiles.length === 0) {
      fileInputRef.current?.click()
      return
    }
    navigate('scanning')
  }

  // Scanning animation
  useEffect(() => {
    if (view !== 'scanning') return
    setScanProgress(0)
    setScanItems([])
    const items = ['Aadhaar Number detected', 'Full Name detected', 'Date of Birth detected', 'PAN Number detected', 'Address detected', 'Mobile Number detected', 'Email Address detected']
    let i = 0
    const interval = setInterval(() => {
      setScanProgress(p => Math.min(p + 13, 100))
      if (i < items.length) { setScanItems(p => [...p, items[i]]); i++ }
    }, 500)
    const timer = setTimeout(() => { clearInterval(interval); navigate('results') }, 4000)
    return () => { clearInterval(interval); clearTimeout(timer) }
  }, [view])

  // Update privacy score based on actions
  useEffect(() => {
    const risk = piiItems.reduce((acc, item) => {
      if (item.action === 'keep') return acc + (item.risk === 'high' ? 20 : item.risk === 'medium' ? 10 : 3)
      if (item.action === 'mask') return acc + (item.risk === 'high' ? 6 : item.risk === 'medium' ? 4 : 1)
      return acc
    }, 0)
    setPrivacyScore(Math.min(100, risk))
  }, [piiItems])

  // Chat scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const sendChat = (text: string) => {
    if (!text.trim()) return
    setChatMessages(m => [...m, { role: 'user', text }])
    setChatInput('')
    setChatTyping(true)
    setTimeout(() => {
      const reply = AI_RESPONSES[text] || "That's a great question about data privacy. Based on my analysis of your document, I recommend following data minimization principles — only retain what's strictly necessary for the stated purpose. Would you like me to walk you through each detected field?"
      setChatMessages(m => [...m, { role: 'ai', text: reply }])
      setChatTyping(false)
    }, 1200)
  }

  const updateAction = (id: string, action: 'keep' | 'mask' | 'remove') => {
    setPiiItems(items => items.map(i => i.id === id ? { ...i, action } : i))
  }

  const autoProtect = () => {
    setPiiItems(items => items.map(i => ({
      ...i, action: i.risk === 'high' ? 'mask' : i.risk === 'medium' ? 'mask' : 'keep'
    })))
  }

  // Slider drag
  const handleSliderDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!sliderRef.current) return
    const rect = sliderRef.current.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const pos = Math.max(10, Math.min(90, ((clientX - rect.left) / rect.width) * 100))
    setSliderPos(pos)
  }, [])

  // ─── Navbar ───────────────────────────────────────────────────────────────

  const Navbar = () => (
    <nav className="fixed top-0 inset-x-0 z-50 h-16 glass-card border-b border-border px-6 flex items-center justify-between">
      <button onClick={() => navigate('landing')} className="flex items-center gap-2.5 group">
        <div className="w-8 h-8 espresso-gradient rounded-lg flex items-center justify-center shadow-sm">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2 L15 5 L15 11 Q15 15.5 9 17.5 Q3 15.5 3 11 L3 5 Z" fill="none" stroke="#C9982A" strokeWidth="1.5"/>
            <path d="M6 9 L8 11 L12 7" stroke="#C9982A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="font-display font-semibold text-primary text-lg tracking-tight">PiiSafe<span className="text-accent">.</span></span>
      </button>

      {view !== 'landing' && (
        <div className="hidden md:flex items-center gap-1">
          {(['Home', 'Scan', 'Documents', 'Reports', 'Settings'] as const).map(item => (
            <button key={item}
              onClick={() => item === 'Home' ? navigate('landing') : item === 'Scan' ? navigate('scan') : item === 'Reports' ? navigate('report') : null}
              className="px-3.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
              {item}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Language */}
        <div className="relative">
          <button onClick={() => setLangOpen(p => !p)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all border border-border">
            🌐 <span className="hidden sm:inline">{lang}</span> <span className="text-xs opacity-60">▾</span>
          </button>
          {langOpen && (
            <div className="absolute right-0 top-11 w-44 bg-card border border-border rounded-xl shadow-xl py-1 z-50 animate-fadeInUp">
              {LANGUAGES.map(l => (
                <button key={l} onClick={() => { setLang(l); setLangOpen(false) }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-secondary transition-colors ${l === lang ? 'text-accent font-semibold' : 'text-foreground'}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notif */}
        <div className="relative">
          <button onClick={() => setNotifOpen(p => !p)}
            className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-all border border-border">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2 Q11 2 11 6 L11 9 L13 11 L3 11 L5 9 L5 6 Q5 2 8 2Z" stroke="currentColor" strokeWidth="1.4" fill="none"/>
              <path d="M6.5 11 Q6.5 12.5 8 12.5 Q9.5 12.5 9.5 11" stroke="currentColor" strokeWidth="1.4" fill="none"/>
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"/>
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-11 w-72 bg-card border border-border rounded-xl shadow-xl py-2 z-50 animate-fadeInUp">
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border mb-1">Notifications</div>
              {[
                { title: 'Scan Complete', desc: '7 PII items detected in Aadhaar_scan.pdf', time: '2m ago', dot: 'bg-amber-500' },
                { title: 'Document Protected', desc: 'PAN_card.pdf successfully redacted', time: '1h ago', dot: 'bg-green-500' },
                { title: 'High Risk Alert', desc: 'Unmasked Aadhaar detected in batch', time: '3h ago', dot: 'bg-red-500' },
              ].map((n, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-secondary transition-colors cursor-pointer">
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.dot}`}/>
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.desc}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 opacity-60">{n.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="w-9 h-9 rounded-lg espresso-gradient flex items-center justify-center text-white text-sm font-semibold cursor-pointer">
          AK
        </div>
      </div>
    </nav>
  )

  // ─── AI Chat ──────────────────────────────────────────────────────────────

  const AIChat = () => (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {chatOpen && (
        <div className="w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl flex flex-col animate-fadeInUp overflow-hidden" style={{ height: 460 }}>
          {/* Header */}
          <div className="espresso-gradient p-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="#C9982A" strokeWidth="1.5"/>
                  <path d="M5 8 Q8 5 11 8" stroke="#C9982A" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  <circle cx="8" cy="10" r="1" fill="#C9982A"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Privacy AI Assistant</p>
                <p className="text-white/60 text-xs">{lang} · Online</p>
              </div>
            </div>
            <button onClick={() => setChatOpen(false)} className="text-white/60 hover:text-white transition-colors text-lg leading-none">×</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-secondary/30">
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'ai' && (
                  <div className="w-6 h-6 espresso-gradient rounded-full flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center">
                    <span className="text-accent text-xs">✦</span>
                  </div>
                )}
                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'espresso-gradient text-white rounded-br-sm'
                    : 'bg-card border border-border text-foreground rounded-bl-sm shadow-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {chatTyping && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 espresso-gradient rounded-full flex-shrink-0 flex items-center justify-center">
                  <span className="text-accent text-xs">✦</span>
                </div>
                <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground rounded-full dot-1"/>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full dot-2"/>
                    <span className="w-2 h-2 bg-muted-foreground rounded-full dot-3"/>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* Quick replies */}
          <div className="px-3 py-2 flex gap-1.5 flex-wrap border-t border-border bg-card/50">
            {QUICK_REPLIES.map(r => (
              <button key={r} onClick={() => sendChat(r)}
                className="px-2.5 py-1 rounded-full text-xs bg-secondary text-secondary-foreground hover:bg-muted transition-colors border border-border">
                {r}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border bg-card flex gap-2">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat(chatInput)}
              placeholder="Ask about PII, privacy risks..."
              className="flex-1 bg-secondary rounded-xl px-3 py-2 text-sm outline-none border border-transparent focus:border-accent transition-colors"/>
            <button onClick={() => sendChat(chatInput)}
              className="w-9 h-9 espresso-gradient rounded-xl flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7 L12 7 M8 3 L12 7 L8 11" stroke="#C9982A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setChatOpen(p => !p)}
        className="w-14 h-14 espresso-gradient rounded-2xl shadow-xl flex items-center justify-center hover:scale-105 transition-transform relative">
        <div className="absolute inset-0 rounded-2xl opacity-40" style={{
          animation: 'ping-slow 2s ease-out infinite',
          background: 'rgba(201,152,42,0.3)',
          transform: 'scale(1)'
        }}/>
        {chatOpen ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M6 6 L16 16 M16 6 L6 16" stroke="#C9982A" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="8" stroke="#C9982A" strokeWidth="1.8"/>
            <path d="M8 11 Q11 7.5 14 11" stroke="#C9982A" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            <circle cx="11" cy="13.5" r="1.2" fill="#C9982A"/>
          </svg>
        )}
      </button>
    </div>
  )

  // ─── LANDING ──────────────────────────────────────────────────────────────

  const Landing = () => (
    <div className="min-h-screen warm-gradient">
      <Navbar/>
      <div className="pt-16 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto px-6 py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent/30 bg-accent/10 text-accent text-sm font-medium">
                <span className="w-2 h-2 bg-accent rounded-full animate-pulse"/>
                AI-Powered · India-Ready · Compliant
              </div>
              <h1 className="font-display text-5xl md:text-6xl font-bold text-primary leading-[1.1] tracking-tight">
                Protect Sensitive Data<br/>
                <span className="italic text-accent">Before</span> It Becomes<br/>a Risk.
              </h1>
              <p className="text-muted-foreground text-lg leading-relaxed max-w-md">
                AI-powered PII detection, analysis and protection for sensitive documents and data. Aadhaar, PAN, Driving Licence and more.
              </p>
              <div className="flex flex-wrap gap-4">
                <button onClick={() => navigate('scan')}
                  className="px-7 py-3.5 espresso-gradient text-white rounded-xl font-semibold shadow-lg hover:opacity-90 hover:scale-[1.02] transition-all duration-200 flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <rect x="3" y="3" width="12" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M6 8 L12 8 M6 11 L10 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <path d="M1 9 L17 9" stroke="#C9982A" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.8"/>
                  </svg>
                  Scan a Document
                </button>
                <button onClick={() => navigate('results')}
                  className="px-7 py-3.5 bg-card text-primary rounded-xl font-semibold border border-border hover:bg-secondary hover:scale-[1.02] transition-all duration-200 shadow-sm">
                  Explore Protection
                </button>
              </div>

              {/* Trust indicators */}
              <div className="flex items-center gap-6 pt-4">
                {[
                  { label: '2.4M+', desc: 'Documents Secured' },
                  { label: '99.2%', desc: 'Detection Accuracy' },
                  { label: 'DPDP', desc: 'Act Compliant' },
                ].map(({ label, desc }) => (
                  <div key={label} className="text-center">
                    <p className="font-display font-bold text-xl text-primary">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right illustration */}
            <div className="relative flex justify-center">
              <div className="w-full max-w-sm aspect-square">
                <HeroIllustration/>
              </div>
              {/* Floating card */}
              <div className="absolute bottom-8 -left-4 glass-card rounded-2xl p-4 shadow-xl w-48 animate-fadeInUp" style={{ animationDelay: '0.3s' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
                  <span className="text-xs font-semibold text-foreground">Live Detection</span>
                </div>
                <p className="text-xs text-muted-foreground">Aadhaar • PAN • DOB</p>
                <p className="text-xs text-muted-foreground">Address • Phone</p>
                <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full w-4/5"/>
                </div>
              </div>
            </div>
          </div>

          {/* Feature row */}
          <div className="mt-24 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: '🔍', title: 'AI Detection', desc: 'Detects 20+ PII types with 99%+ confidence using ML models' },
              { icon: '🛡️', title: 'Smart Masking', desc: 'Intelligent redaction that preserves document utility' },
              { icon: '📊', title: 'Risk Scoring', desc: 'Privacy risk scores before and after protection' },
              { icon: '🌐', title: 'Multilingual', desc: 'Supports 11 Indian languages for broader accessibility' },
            ].map(f => (
              <div key={f.title} className="bg-card border border-border rounded-2xl p-6 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div className="w-11 h-11 bg-secondary rounded-xl flex items-center justify-center text-xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  const Dashboard = () => (
    <div className="min-h-screen bg-background">
      <Navbar/>
      <div className="pt-24 pb-16 max-w-7xl mx-auto px-6">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-primary">PII Protection Center</h1>
          <p className="text-muted-foreground mt-1">Good morning, Ananya. Here's your privacy overview.</p>
        </div>

        {/* Stats */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Documents Scanned', value: '142', delta: '+12 today', color: 'text-primary', bg: 'bg-secondary' },
            { label: 'PII Items Detected', value: '1,038', delta: '+89 today', color: 'text-amber-700', bg: 'bg-amber-50' },
            { label: 'High Risk Items', value: '23', delta: '↓ 8 resolved', color: 'text-red-700', bg: 'bg-red-50' },
            { label: 'Protected Documents', value: '119', delta: '83.8% rate', color: 'text-green-700', bg: 'bg-green-50' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-5 hover:shadow-sm transition-shadow">
              <p className="text-sm text-muted-foreground mb-2">{s.label}</p>
              <p className={`font-display text-3xl font-bold ${s.color}`}>{s.value}</p>
              <div className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.color}`}>{s.delta}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Upload Card */}
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-primary">Scan New Document</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Upload and analyze for sensitive information</p>
              </div>
              <div className="w-16 h-16 opacity-90">
                <ScanIllustration/>
              </div>
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
                dragOver ? 'border-accent bg-accent/5 scale-[1.01]' : 'border-border hover:border-accent/50 hover:bg-secondary/50'
              }`}>
              <div className="w-14 h-14 mx-auto bg-secondary rounded-2xl flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 16 L12 8 M8 12 L12 8 L16 12" stroke="#7A5C3E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M4 18 Q4 20 6 20 L18 20 Q20 20 20 18" stroke="#7A5C3E" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="font-semibold text-foreground">Drop files here or click to upload</p>
              <p className="text-sm text-muted-foreground mt-1">PDF, JPG, PNG, DOC, DOCX · Multiple files supported</p>
              <div className="flex justify-center gap-2 mt-4 flex-wrap">
                {['PDF', 'JPG', 'PNG', 'DOC', 'Text'].map(t => (
                  <span key={t} className="px-2.5 py-1 bg-secondary border border-border rounded-lg text-xs font-mono-data font-medium text-muted-foreground">{t}</span>
                ))}
              </div>
              {selectedFiles.length > 0 && (
                <div className="mt-5 mx-auto max-w-xl rounded-xl border border-accent/30 bg-accent/5 p-3 text-left">
                  <p className="text-xs font-semibold text-primary mb-2">
                    {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                  </p>
                  <div className="space-y-1.5">
                    {selectedFiles.map(file => (
                      <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 text-sm text-foreground">
                        <span className="w-6 h-6 rounded-md bg-white border border-border flex items-center justify-center text-xs">📄</span>
                        <span className="truncate flex-1">{file.name}</span>
                        <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={allowedFileTypes}
                multiple
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
            <button onClick={startScan}
              className="w-full mt-4 py-3.5 espresso-gradient text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-md">
              Start AI Scan
            </button>
          </div>

          {/* Recent */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-semibold text-foreground mb-4">Recent Documents</h3>
            <div className="space-y-3">
              {[
                { name: 'Aadhaar_scan.pdf', status: 'Protected', risk: 'high', time: '2m ago' },
                { name: 'Employee_records.docx', status: 'Scanned', risk: 'medium', time: '1h ago' },
                { name: 'Patient_form.pdf', status: 'Pending', risk: 'high', time: '3h ago' },
                { name: 'KYC_batch_oct.zip', status: 'Protected', risk: 'low', time: 'Yesterday' },
                { name: 'Voter_list_2024.csv', status: 'Scanning', risk: 'medium', time: 'Yesterday' },
              ].map(doc => (
                <div key={doc.name} className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors cursor-pointer">
                  <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="#7A5C3E" strokeWidth="1.2" fill="none"/>
                      <path d="M4.5 5 L9.5 5 M4.5 7.5 L7.5 7.5" stroke="#7A5C3E" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">{doc.time}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    doc.status === 'Protected' ? 'bg-green-50 text-green-700' :
                    doc.status === 'Scanning' ? 'bg-blue-50 text-blue-700' :
                    doc.status === 'Pending' ? 'bg-red-50 text-red-700' :
                    'bg-secondary text-muted-foreground'
                  }`}>{doc.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── SCAN ─────────────────────────────────────────────────────────────────

  const Scan = () => (
    <div className="min-h-screen bg-background">
      <Navbar/>
      <div className="pt-24 pb-16 max-w-4xl mx-auto px-6">
        <button onClick={() => navigate('dashboard')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          ← Back to Dashboard
        </button>
        <h1 className="font-display text-3xl font-bold text-primary mb-2">Scan Document</h1>
        <p className="text-muted-foreground mb-8">Upload one or more documents for AI-powered PII detection</p>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 mb-6 ${
            dragOver ? 'border-accent bg-accent/5 shadow-lg scale-[1.01]' : 'border-border bg-card hover:border-accent/40 hover:bg-secondary/30'
          }`}>
          <div className="w-20 h-20 mx-auto mb-6"><ScanIllustration/></div>
          <h3 className="font-display text-xl font-semibold text-primary mb-2">Drop your documents here</h3>
          <p className="text-muted-foreground mb-6">or click to browse files from your computer</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {['PDF', 'JPG', 'PNG', 'DOC', 'DOCX', 'Text Paste'].map(t => (
              <span key={t} className="px-3 py-1.5 bg-secondary border border-border rounded-lg text-sm font-mono-data text-muted-foreground">{t}</span>
            ))}
          </div>
          {selectedFiles.length > 0 && (
            <div className="mt-6 mx-auto max-w-2xl rounded-xl border border-accent/30 bg-accent/5 p-4 text-left">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-primary">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready to scan
                </p>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setSelectedFiles([]) }}
                  className="text-xs text-muted-foreground hover:text-red-600"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-2">
                {selectedFiles.map(file => (
                  <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-lg bg-white/70 border border-border p-2.5">
                    <span className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">📄</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <span className="text-xs text-green-700 font-semibold">Ready</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={allowedFileTypes}
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          {[
            { icon: '🪪', title: 'Aadhaar Card', desc: 'Number, biometrics, address' },
            { icon: '💳', title: 'PAN Card', desc: 'Tax ID, name, DOB' },
            { icon: '🚗', title: 'Driving Licence', desc: 'DL number, address, DOB' },
            { icon: '📕', title: 'Passport', desc: 'Passport number, nationality' },
            { icon: '🗳️', title: 'Voter ID', desc: 'EPIC number, address' },
            { icon: '📄', title: 'General Document', desc: 'Any document with PII' },
          ].map(c => (
            <div key={c.title}
              className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-accent/40 hover:shadow-sm hover:bg-secondary/30 transition-all">
              <span className="text-2xl">{c.icon}</span>
              <div>
                <p className="text-sm font-semibold text-foreground">{c.title}</p>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <button onClick={startScan}
          className={`w-full py-4 rounded-xl font-semibold text-lg transition-opacity shadow-lg ${
            selectedFiles.length > 0
              ? 'espresso-gradient text-white hover:opacity-90'
              : 'bg-primary text-white hover:opacity-90'
          }`}>
          {selectedFiles.length > 0 ? `Start AI Scan · ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}` : 'Choose File to Start AI Scan'}
        </button>
      </div>
    </div>
  )

  // ─── SCANNING ─────────────────────────────────────────────────────────────

  const Scanning = () => (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Navbar/>
      <div className="max-w-2xl w-full px-6 text-center">
        <div className="w-48 h-48 mx-auto mb-8 relative">
          <div className="absolute inset-0 bg-secondary rounded-3xl overflow-hidden">
            <ScanIllustration/>
            <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent animate-scan-line opacity-90"/>
          </div>
          <div className="absolute -inset-3 rounded-3xl border border-accent/20 animate-pulse"/>
        </div>

        <div className="mb-2">
          <p className="font-display text-2xl font-semibold text-primary">AI is analyzing your document<span className="inline-flex gap-0.5 ml-1"><span className="dot-1 inline-block w-1.5 h-1.5 bg-accent rounded-full"/><span className="dot-2 inline-block w-1.5 h-1.5 bg-accent rounded-full"/><span className="dot-3 inline-block w-1.5 h-1.5 bg-accent rounded-full"/></span></p>
          <p className="text-muted-foreground mt-1">Scanning for government-issued PII and sensitive information</p>
        </div>

        <div className="my-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Scan progress</span>
            <span className="font-mono-data font-medium text-accent">{scanProgress}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full espresso-gradient rounded-full transition-all duration-500" style={{ width: `${scanProgress}%` }}/>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 text-left space-y-2.5 mt-4">
          {scanItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3 animate-fadeInUp">
              <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5 L4 7 L8 3" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-sm text-foreground">{item}</span>
              <RiskBadge risk={i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low'}/>
            </div>
          ))}
          {scanItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">Initializing AI models...</p>
          )}
        </div>
      </div>
    </div>
  )

  // ─── RESULTS ──────────────────────────────────────────────────────────────

  const Results = () => (
    <div className="min-h-screen bg-background">
      <Navbar/>
      <div className="pt-24 pb-16 max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-primary">PII Detection Report</h1>
            <p className="text-muted-foreground mt-1">Aadhaar_scan.pdf · Scanned just now · <span className="text-red-600 font-medium">7 PII items found</span></p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => navigate('necessity')} className="px-5 py-2.5 bg-card border border-border rounded-xl text-sm font-semibold hover:bg-secondary transition-colors">Necessity Check →</button>
            <button onClick={() => navigate('redact')} className="px-5 py-2.5 espresso-gradient text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-md">Protect Document</button>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Document preview */}
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Document Preview</h3>
              <span className="text-xs font-mono-data bg-muted px-2 py-1 rounded-lg text-muted-foreground">Page 1 of 2</span>
            </div>
            <div className="bg-secondary rounded-xl p-4 space-y-3 font-mono-data text-xs">
              <div className="font-semibold text-foreground text-sm">AADHAAR ENROLMENT FORM</div>
              <div className="text-muted-foreground">Enrolment No: 1234/56789/01234</div>
              <div className="space-y-1.5">
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Name:</span><span className="bg-green-200/60 text-green-900 px-1 rounded">Ananya Krishnamurthy</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Date of Birth:</span><span className="bg-amber-200/60 text-amber-900 px-1 rounded">14 March 1992</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Aadhaar No:</span><span className="bg-red-200/60 text-red-900 px-1 rounded">3821 5674 9012</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">PAN:</span><span className="bg-red-200/60 text-red-900 px-1 rounded">ABCDE1234F</span></div>
              </div>
              <div className="border-t border-border pt-2 space-y-1.5">
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Mobile:</span><span className="bg-red-200/60 text-red-900 px-1 rounded">+91 98345 67812</span></div>
                <div className="flex gap-2"><span className="text-muted-foreground w-24">Email:</span><span className="bg-amber-200/60 text-amber-900 px-1 rounded">ananya.k@mailbox.in</span></div>
                <div className="flex gap-2 flex-wrap"><span className="text-muted-foreground w-24">Address:</span><span className="bg-amber-200/60 text-amber-900 px-1 rounded">42, Shivaji Nagar, Pune 411004</span></div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Document Type Detected</span>
                <span className="font-medium text-foreground">Aadhaar Card</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Detection Confidence</span>
                <span className="font-mono-data font-medium text-green-600">99.2%</span>
              </div>
            </div>
          </div>

          {/* PII list */}
          <div className="lg:col-span-3 space-y-3">
            <h3 className="font-semibold text-foreground">Detected Information</h3>
            {piiItems.map(item => (
              <div key={item.id} className="bg-card border border-border rounded-xl p-4 hover:border-accent/30 transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{item.type}</span>
                      <RiskBadge risk={item.risk}/>
                      <span className="text-xs text-muted-foreground font-mono-data">{item.confidence}% confidence</span>
                    </div>
                    <p className="font-mono-data text-xs text-muted-foreground mb-1">Value: {item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.recommendation}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <ActionButton action="keep" active={item.action === 'keep'} onClick={() => updateAction(item.id, 'keep')}/>
                    <ActionButton action="mask" active={item.action === 'mask'} onClick={() => updateAction(item.id, 'mask')}/>
                    <ActionButton action="remove" active={item.action === 'remove'} onClick={() => updateAction(item.id, 'remove')}/>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 opacity-0 group-hover:opacity-100 transition-opacity">📍 {item.location}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // ─── NECESSITY CHECK ──────────────────────────────────────────────────────

  const Necessity = () => (
    <div className="min-h-screen bg-background">
      <Navbar/>
      <div className="pt-24 pb-16 max-w-5xl mx-auto px-6">
        <button onClick={() => navigate('results')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">← Back to Results</button>
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs font-semibold mb-3">
            ✦ Smart Feature
          </div>
          <h1 className="font-display text-3xl font-bold text-primary">PII Necessity Check</h1>
          <p className="text-muted-foreground mt-1">AI analysis: do you actually need each piece of information?</p>
        </div>

        <div className="space-y-4">
          {piiItems.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-2xl p-6">
              <div className="grid md:grid-cols-4 gap-4 mb-4">
                <div><p className="text-xs text-muted-foreground mb-1">Detected</p><p className="font-semibold text-sm text-foreground">{item.type}</p></div>
                <div><p className="text-xs text-muted-foreground mb-1">Purpose</p><p className="text-sm text-foreground">{item.purpose}</p></div>
                <div><p className="text-xs text-muted-foreground mb-1">Necessity</p><p className={`text-sm font-medium ${item.necessity.includes('Required') && !item.necessity.includes('Possibly') ? 'text-green-700' : item.necessity.includes('Possibly') ? 'text-amber-700' : 'text-red-700'}`}>{item.necessity}</p></div>
                <div><p className="text-xs text-muted-foreground mb-1">Risk</p><RiskBadge risk={item.risk}/></div>
              </div>

              <div className="bg-secondary/70 border border-border rounded-xl p-4 mb-4">
                <p className="text-xs text-muted-foreground mb-1">AI Recommendation</p>
                <p className="text-sm text-foreground italic">"{item.recommendation}"</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <ActionButton action="keep" active={item.action === 'keep'} onClick={() => updateAction(item.id, 'keep')}/>
                <ActionButton action="mask" active={item.action === 'mask'} onClick={() => updateAction(item.id, 'mask')}/>
                <ActionButton action="remove" active={item.action === 'remove'} onClick={() => updateAction(item.id, 'remove')}/>
                <button onClick={() => sendChat(`Is this information necessary? (${item.type})`)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border">
                  Ask AI ✦
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => navigate('redact')}
          className="w-full mt-6 py-4 espresso-gradient text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg">
          Proceed to Redaction Studio →
        </button>
      </div>
    </div>
  )

  // ─── REDACT ───────────────────────────────────────────────────────────────

  const Redact = () => (
    <div className="min-h-screen bg-background">
      <Navbar/>
      <div className="pt-24 pb-16 max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-primary">Protect Your Document</h1>
            <p className="text-muted-foreground mt-1">Review and apply protection to each detected PII field</p>
          </div>
          <div className="flex gap-3">
            <button onClick={autoProtect}
              className="px-5 py-2.5 gold-gradient text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-md">
              ⚡ Auto-Protect All High Risk
            </button>
            <button onClick={() => navigate('comparison')}
              className="px-5 py-2.5 espresso-gradient text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-md">
              Preview →
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-3">
            <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider text-muted-foreground">PII Fields</h3>
            {piiItems.map(item => (
              <div key={item.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{item.type}</span>
                    <RiskBadge risk={item.risk}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3 font-mono-data text-xs">
                  <div className="bg-red-50 border border-red-100 rounded-lg p-2">
                    <p className="text-red-500 mb-0.5 text-[10px] font-sans">Original</p>
                    <p className="text-red-800 font-medium">{item.value}</p>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-lg p-2">
                    <p className="text-green-600 mb-0.5 text-[10px] font-sans">{item.action === 'remove' ? 'Removed' : item.action === 'mask' ? 'Masked' : 'Kept'}</p>
                    <p className="text-green-800 font-medium">{item.action === 'remove' ? '[REMOVED]' : item.action === 'mask' ? item.masked : item.value}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {(['keep', 'mask', 'remove'] as const).map(a => (
                    <ActionButton key={a} action={a} active={item.action === a} onClick={() => updateAction(item.id, a)}/>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Live Preview */}
          <div className="bg-card border border-border rounded-2xl p-6 sticky top-24 h-fit">
            <h3 className="font-semibold text-foreground mb-4">Live Preview</h3>
            <div className="bg-secondary rounded-xl p-4 font-mono-data text-xs space-y-3">
              <div className="font-semibold text-foreground text-sm">AADHAAR ENROLMENT FORM</div>
              <div className="text-muted-foreground">Enrolment No: 1234/56789/01234</div>
              {piiItems.map(item => {
                const display = item.action === 'remove' ? null : item.action === 'mask' ? item.masked : item.value
                const label = { 'Aadhaar Number': 'Aadhaar No', 'PAN Number': 'PAN', 'Full Name': 'Name', 'Date of Birth': 'Date of Birth', 'Mobile Number': 'Mobile', 'Email Address': 'Email', 'Residential Address': 'Address' }[item.type] ?? item.type
                return display === null ? (
                  <div key={item.id} className="flex gap-2 opacity-40">
                    <span className="text-muted-foreground w-24">{label}:</span>
                    <span className="line-through text-muted-foreground">{item.value}</span>
                  </div>
                ) : (
                  <div key={item.id} className="flex gap-2">
                    <span className="text-muted-foreground w-24">{label}:</span>
                    <span className={item.action === 'mask' ? 'text-amber-700' : 'text-green-700'}>{display}</span>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Privacy Risk Score</span>
              <span className={`font-mono-data font-bold text-lg ${privacyScore > 60 ? 'text-red-600' : privacyScore > 30 ? 'text-amber-600' : 'text-green-600'}`}>{privacyScore}/100</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── COMPARISON ───────────────────────────────────────────────────────────

  const Comparison = () => {
    const [dragging, setDragging] = useState(false)
    return (
      <div className="min-h-screen bg-background">
        <Navbar/>
        <div className="pt-24 pb-16 max-w-6xl mx-auto px-6">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-primary">Before & After Protection</h1>
            <p className="text-muted-foreground mt-1">Drag the slider to compare original and protected versions</p>
          </div>

          <div ref={sliderRef}
            className="relative bg-card border border-border rounded-2xl overflow-hidden cursor-col-resize select-none"
            style={{ height: 420 }}
            onMouseMove={e => dragging && handleSliderDrag(e)}
            onMouseDown={e => { setDragging(true); handleSliderDrag(e) }}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            onTouchMove={handleSliderDrag}
            onTouchStart={e => handleSliderDrag(e)}>

            {/* Before (full width, clipped) */}
            <div className="absolute inset-0 bg-red-50 p-10 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
              <div className="max-w-sm">
                <div className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-4">⚠ Original · Exposed</div>
                <div className="font-mono-data text-sm space-y-3 text-foreground">
                  <div><span className="text-muted-foreground text-xs">Name: </span><span className="bg-yellow-200 px-1 rounded">Ananya Krishnamurthy</span></div>
                  <div><span className="text-muted-foreground text-xs">Aadhaar: </span><span className="bg-red-200 px-1 rounded font-bold">3821 5674 9012</span></div>
                  <div><span className="text-muted-foreground text-xs">PAN: </span><span className="bg-red-200 px-1 rounded font-bold">ABCDE1234F</span></div>
                  <div><span className="text-muted-foreground text-xs">DOB: </span><span className="bg-orange-200 px-1 rounded">14 March 1992</span></div>
                  <div><span className="text-muted-foreground text-xs">Mobile: </span><span className="bg-red-200 px-1 rounded">+91 98345 67812</span></div>
                  <div><span className="text-muted-foreground text-xs">Email: </span><span className="bg-orange-200 px-1 rounded">ananya.k@mailbox.in</span></div>
                  <div><span className="text-muted-foreground text-xs">Address: </span><span className="bg-orange-200 px-1 rounded">42, Shivaji Nagar, Pune 411004</span></div>
                </div>
                <div className="mt-6 px-3 py-2 bg-red-100 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                  🔴 Risk Score: 82/100 · HIGH RISK
                </div>
              </div>
            </div>

            {/* After */}
            <div className="absolute inset-0 bg-green-50 p-10 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}>
              <div className="ml-auto max-w-sm">
                <div className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-4">✓ Protected · Safe</div>
                <div className="font-mono-data text-sm space-y-3 text-foreground">
                  <div><span className="text-muted-foreground text-xs">Name: </span><span className="bg-green-100 px-1 rounded">Ananya Krishnamurthy</span></div>
                  <div><span className="text-muted-foreground text-xs">Aadhaar: </span><span className="bg-green-100 px-1 rounded font-bold">XXXX XXXX 9012</span></div>
                  <div><span className="text-muted-foreground text-xs">PAN: </span><span className="bg-green-100 px-1 rounded font-bold">XXXXX1234X</span></div>
                  <div><span className="text-muted-foreground text-xs">DOB: </span><span className="bg-green-100 px-1 rounded">March 1992</span></div>
                  <div className="opacity-40 line-through text-xs text-muted-foreground">Mobile: [REMOVED]</div>
                  <div className="opacity-40 line-through text-xs text-muted-foreground">Email: [REMOVED]</div>
                  <div><span className="text-muted-foreground text-xs">Address: </span><span className="bg-green-100 px-1 rounded">Pune, Maharashtra</span></div>
                </div>
                <div className="mt-6 px-3 py-2 bg-green-100 border border-green-200 rounded-xl text-xs text-green-700 font-semibold">
                  🟢 Risk Score: {privacyScore}/100 · {privacyScore < 30 ? 'SAFE' : privacyScore < 60 ? 'MODERATE' : 'CAUTION'}
                </div>
              </div>
            </div>

            {/* Slider handle */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg" style={{ left: `${sliderPos}%` }}>
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 espresso-gradient rounded-full shadow-xl flex items-center justify-center cursor-col-resize">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5 4 L2 8 L5 12 M11 4 L14 8 L11 12" stroke="#C9982A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-4 left-4 text-xs font-bold text-red-600 bg-white/80 px-2 py-1 rounded-lg">BEFORE</div>
            <div className="absolute top-4 right-4 text-xs font-bold text-green-600 bg-white/80 px-2 py-1 rounded-lg">AFTER</div>
          </div>

          <div className="mt-6 flex gap-4 justify-center">
            <button onClick={() => navigate('score')} className="px-6 py-3 espresso-gradient text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-md">
              View Privacy Score →
            </button>
            <button onClick={() => navigate('report')} className="px-6 py-3 bg-card border border-border rounded-xl font-semibold hover:bg-secondary transition-colors">
              Generate Report
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── PRIVACY SCORE ────────────────────────────────────────────────────────

  const PrivacyScore = () => {
    const [animated, setAnimated] = useState(false)
    const displayScore = animated ? privacyScore : 82

    useEffect(() => { const t = setTimeout(() => setAnimated(true), 300); return () => clearTimeout(t) }, [])

    return (
      <div className="min-h-screen bg-background">
        <Navbar/>
        <div className="pt-24 pb-16 max-w-4xl mx-auto px-6">
          <h1 className="font-display text-3xl font-bold text-primary mb-2">Privacy Risk Score</h1>
          <p className="text-muted-foreground mb-10">Your document's exposure level before and after protection</p>

          <div className="grid sm:grid-cols-2 gap-8 mb-10">
            {[{ label: 'Before Protection', score: 82, desc: 'High risk — multiple exposed identifiers' },
              { label: 'After Protection', score: displayScore, desc: displayScore < 30 ? 'Safe — most identifiers protected' : 'Moderate — some risk remains' }].map(({ label, score, desc }) => (
              <div key={label} className="bg-card border border-border rounded-2xl p-8 text-center">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-6">{label}</p>
                <div className="flex justify-center mb-4"><ScoreRing score={score} size={160}/></div>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 mb-6">
            <h3 className="font-semibold text-foreground mb-5">Breakdown</h3>
            <div className="grid sm:grid-cols-5 gap-4">
              {[
                { label: 'PII Found', value: 7, color: 'text-foreground', bg: 'bg-secondary' },
                { label: 'High Risk', value: 3, color: 'text-red-700', bg: 'bg-red-50' },
                { label: 'Masked', value: piiItems.filter(p => p.action === 'mask').length, color: 'text-amber-700', bg: 'bg-amber-50' },
                { label: 'Removed', value: piiItems.filter(p => p.action === 'remove').length, color: 'text-green-700', bg: 'bg-green-50' },
                { label: 'Kept As-Is', value: piiItems.filter(p => p.action === 'keep').length, color: 'text-blue-700', bg: 'bg-blue-50' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 text-center ${s.bg}`}>
                  <p className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <button onClick={() => navigate('report')} className="flex-1 py-3.5 espresso-gradient text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-md">
              Generate Full Report →
            </button>
            <button onClick={() => navigate('comparison')} className="px-6 py-3.5 bg-card border border-border rounded-xl font-semibold hover:bg-secondary transition-colors">
              ← Compare
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── REPORT ───────────────────────────────────────────────────────────────

  const Report = () => (
    <div className="min-h-screen bg-background">
      <Navbar/>
      <div className="pt-24 pb-16 max-w-4xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <h1 className="font-display text-3xl font-bold text-primary">PII Security Report</h1>
          <div className="flex gap-3">
            <button className="px-5 py-2.5 bg-card border border-border rounded-xl text-sm font-semibold hover:bg-secondary transition-colors flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2 L7 9 M4 7 L7 10 L10 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 11 L12 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Download Report
            </button>
            <button className="px-5 py-2.5 espresso-gradient text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-md flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7 L7 2 L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 2 L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 12 L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Export Protected Doc
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Report header */}
          <div className="espresso-gradient p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-widest mb-2">PiiSafe · Security Report</p>
                <h2 className="font-display text-2xl font-bold text-white">Privacy Protection Summary</h2>
                <p className="text-white/70 mt-1 text-sm">Generated: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <p className="text-white/60 text-xs mb-1">Final Score</p>
                <p className={`font-mono-data font-bold text-3xl ${privacyScore < 30 ? 'text-green-400' : privacyScore < 60 ? 'text-amber-400' : 'text-red-400'}`}>{privacyScore}/100</p>
              </div>
            </div>
          </div>

          <div className="p-8 space-y-6">
            {/* Meta */}
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { label: 'Document Name', value: 'Aadhaar_scan.pdf' },
                { label: 'Scan Date', value: new Date().toLocaleDateString('en-IN') },
                { label: 'Document Type', value: 'Aadhaar Card (99.2% confidence)' },
                { label: 'Total PII Found', value: `${piiItems.length} items` },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-3 border-b border-border">
                  <span className="text-sm text-muted-foreground">{r.label}</span>
                  <span className="text-sm font-medium text-foreground">{r.value}</span>
                </div>
              ))}
            </div>

            {/* PII summary */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">PII Categories & Actions</h3>
              <div className="space-y-2">
                {piiItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                    <RiskBadge risk={item.risk}/>
                    <span className="text-sm font-medium text-foreground flex-1">{item.type}</span>
                    <span className="font-mono-data text-xs text-muted-foreground">{item.confidence}%</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      item.action === 'keep' ? 'bg-green-50 text-green-700' :
                      item.action === 'mask' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{item.action.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Recommendations */}
            <div className="bg-secondary/50 border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <span className="text-accent">✦</span> AI Recommendations
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="text-accent flex-shrink-0">→</span>Apply the Aadhaar masking policy — last 4 digits only, per UIDAI guidelines.</li>
                <li className="flex gap-2"><span className="text-accent flex-shrink-0">→</span>Remove mobile and email from records unless required for active communication.</li>
                <li className="flex gap-2"><span className="text-accent flex-shrink-0">→</span>Store protected documents in encrypted storage with access logging.</li>
                <li className="flex gap-2"><span className="text-accent flex-shrink-0">→</span>Review document retention policy — consider 3-year purge cycle per DPDP Act.</li>
              </ul>
            </div>

            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">This report was generated by PiiSafe AI · For official use, consult a qualified data protection officer.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ─── View Router ──────────────────────────────────────────────────────────

  const renderView = () => {
    switch (view) {
      case 'login':   return <LoginPage navigate={navigate}/>
      case 'register': return <RegisterPage navigate={navigate}/>
      case 'landing': return <Landing/>
      case 'dashboard': return <Dashboard/>
      case 'scan': return <Scan/>
      case 'scanning': return <Scanning/>
      case 'results': return <Results/>
      case 'necessity': return <Necessity/>
      case 'redact': return <Redact/>
      case 'comparison': return <Comparison/>
      case 'score': return <PrivacyScore/>
      case 'report': return <Report/>
    }
  }

  const isAuthView = view === 'login' || view === 'register'

  return (
    <div onClick={() => { setLangOpen(false); setNotifOpen(false) }}>
      {renderView()}
      {!isAuthView && <AIChat/>}

      {/* Bottom nav (landing only) */}
      {view === 'landing' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="glass-card border border-border rounded-2xl px-2 py-2 flex items-center gap-1 shadow-xl">
            {[
              { label: 'Home', icon: '⌂', v: 'landing' as View },
              { label: 'Scan', icon: '⊡', v: 'scan' as View },
              { label: 'Dashboard', icon: '⊞', v: 'dashboard' as View },
              { label: 'Reports', icon: '⊟', v: 'report' as View },
            ].map(item => (
              <button key={item.label} onClick={e => { e.stopPropagation(); navigate(item.v) }}
                className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all text-xs font-medium ${
                  view === item.v ? 'espresso-gradient text-white shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}>
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
