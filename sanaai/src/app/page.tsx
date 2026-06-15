'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const router = useRouter()
  const [modal, setModal]       = useState<'signup' | 'login' | null>(null)
  const [tab, setTab]           = useState<'signup' | 'login'>('signup')
  const [loading, setLoading]   = useState(false)
  const [toast, setToast]       = useState<{ msg: string; type: string } | null>(null)
  const [billing, setBilling]   = useState<'monthly' | 'yearly'>('monthly')

  const [signup, setSignup] = useState({ factory: '', name: '', email: '', password: '' })
  const [login, setLogin]   = useState({ email: '', password: '' })

  function showToast(msg: string, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSignup() {
    const { factory, name, email, password } = signup
    if (!factory || !name || !email || !password) { showToast('⚠️ يرجى إدخال جميع البيانات', 'warning'); return }
    if (password.length < 8) { showToast('⚠️ كلمة المرور ٨ أحرف على الأقل', 'warning'); return }
    setLoading(true)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, factory_name: factory } }
    })
    if (authError) { showToast('❌ ' + authError.message, 'error'); setLoading(false); return }
    showToast(`✅ أهلاً ${name}! تم إنشاء حساب ${factory} بنجاح`, 'success')
    setModal(null)
    setTimeout(() => router.push('/dashboard'), 1500)
    setLoading(false)
  }

  async function handleLogin() {
    const { email, password } = login
    if (!email || !password) { showToast('⚠️ أدخل البريد وكلمة المرور', 'warning'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { showToast('❌ البريد أو كلمة المرور غير صحيحة', 'error'); setLoading(false); return }
    showToast('✅ مرحباً بعودتك!', 'success')
    setModal(null)
    setTimeout(() => router.push('/dashboard'), 800)
    setLoading(false)
  }

  const prices = {
    monthly: { starter: '١٩٩', pro: '٣٩٩', ent: '٧٩٩', label: 'شهرياً' },
    yearly:  { starter: '١٩١', pro: '٣٨٣', ent: '٧٦٧', label: 'شهرياً (يُدفع سنوياً)' },
  }
  const p = prices[billing]

  const toastColors: Record<string, string> = {
    success: '#1B7A6E', warning: '#C8963E', error: '#C24B2A', info: '#3498DB'
  }

  return (
    <div dir="rtl" style={{ fontFamily: "'Cairo', sans-serif", background: '#080C12', color: '#EEF0F6', minHeight: '100vh' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#111927', border: `1px solid ${toastColors[toast.type] || '#1B7A6E'}`,
          padding: '14px 24px', borderRadius: 14, zIndex: 9999, fontSize: 14, fontWeight: 600,
          whiteSpace: 'nowrap', boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
        }}>
          {toast.msg}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#0D1B2A', border: '1px solid rgba(200,150,62,0.2)',
            borderRadius: 24, padding: 40, width: '100%', maxWidth: 420
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
              {(['signup', 'login'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: tab === t ? '#C8963E' : 'rgba(255,255,255,0.05)',
                  color: tab === t ? '#000' : '#7A8A9E', fontWeight: 700, fontSize: 14,
                  fontFamily: "'Cairo', sans-serif"
                }}>
                  {t === 'signup' ? 'إنشاء حساب' : 'تسجيل دخول'}
                </button>
              ))}
            </div>

            {tab === 'signup' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#EEF0F6' }}>ابدأ تجربتك المجانية</h2>
                {[
                  { key: 'factory', placeholder: 'اسم المصنع / الورشة *' },
                  { key: 'name', placeholder: 'اسمك الكامل *' },
                  { key: 'email', placeholder: 'البريد الإلكتروني *', type: 'email' },
                  { key: 'password', placeholder: 'كلمة المرور (٨ أحرف+) *', type: 'password' },
                ].map(f => (
                  <input key={f.key} type={f.type || 'text'} placeholder={f.placeholder}
                    value={(signup as any)[f.key]}
                    onChange={e => setSignup(s => ({ ...s, [f.key]: e.target.value }))}
                    style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10, padding: '12px 16px', color: '#EEF0F6', fontSize: 14,
                      fontFamily: "'Cairo', sans-serif", outline: 'none', textAlign: 'right'
                    }} />
                ))}
                <button onClick={handleSignup} disabled={loading} style={{
                  marginTop: 8, padding: '14px 0', background: loading ? '#666' : '#C8963E',
                  border: 'none', borderRadius: 12, color: '#000', fontWeight: 700, fontSize: 15,
                  cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Cairo', sans-serif"
                }}>
                  {loading ? 'جاري الإنشاء...' : '🚀 ابدأ مجاناً ١٤ يوم'}
                </button>
                <p style={{ fontSize: 11, color: '#7A8A9E', textAlign: 'center', margin: 0 }}>
                  بدون بطاقة ائتمان · إلغاء في أي وقت
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#EEF0F6' }}>مرحباً بعودتك</h2>
                {[
                  { key: 'email', placeholder: 'البريد الإلكتروني', type: 'email' },
                  { key: 'password', placeholder: 'كلمة المرور', type: 'password' },
                ].map(f => (
                  <input key={f.key} type={f.type} placeholder={f.placeholder}
                    value={(login as any)[f.key]}
                    onChange={e => setLogin(l => ({ ...l, [f.key]: e.target.value }))}
                    style={{
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 10, padding: '12px 16px', color: '#EEF0F6', fontSize: 14,
                      fontFamily: "'Cairo', sans-serif", outline: 'none', textAlign: 'right'
                    }} />
                ))}
                <button onClick={handleLogin} disabled={loading} style={{
                  marginTop: 8, padding: '14px 0', background: loading ? '#666' : '#C8963E',
                  border: 'none', borderRadius: 12, color: '#000', fontWeight: 700, fontSize: 15,
                  cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Cairo', sans-serif"
                }}>
                  {loading ? 'جاري الدخول...' : '🔐 تسجيل الدخول'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(8,12,18,0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(200,150,62,0.15)',
        padding: '16px 60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#C8963E', fontFamily: "'Tajawal', sans-serif" }}>
          🏭 صَنَا<span style={{ color: '#EEF0F6' }}>عي</span>
        </div>
        <div style={{ display: 'flex', gap: 32, fontSize: 14, color: '#7A8A9E' }}>
          <a href="#features" style={{ color: '#7A8A9E', textDecoration: 'none' }}>المميزات</a>
          <a href="#pricing" style={{ color: '#7A8A9E', textDecoration: 'none' }}>الأسعار</a>
          <a href="#faq" style={{ color: '#7A8A9E', textDecoration: 'none' }}>الأسئلة</a>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => { setTab('login'); setModal('login') }} style={{
            padding: '8px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10, color: '#EEF0F6', cursor: 'pointer', fontSize: 14, fontFamily: "'Cairo', sans-serif"
          }}>دخول</button>
          <button onClick={() => { setTab('signup'); setModal('signup') }} style={{
            padding: '8px 20px', background: '#C8963E', border: 'none',
            borderRadius: 10, color: '#000', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: "'Cairo', sans-serif"
          }}>ابدأ مجاناً</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '100px 60px', display: 'flex', alignItems: 'center', gap: 60, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px',
            background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.2)',
            borderRadius: 20, fontSize: 12, color: '#C8963E', marginBottom: 24
          }}>
            <span style={{ width: 6, height: 6, background: '#C8963E', borderRadius: '50%', display: 'inline-block' }} />
            الإطلاق الرسمي — النسخة ١.٠
          </div>
          <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.2, margin: '0 0 24px', fontFamily: "'Tajawal', sans-serif" }}>
            <span style={{ display: 'block' }}>أدِر مصنعك</span>
            <span style={{ display: 'block', color: '#C8963E' }}>بذكاء حقيقي</span>
            <span style={{ display: 'block', WebkitTextStroke: '1px #EEF0F6', color: 'transparent' }}>من مكان واحد</span>
          </h1>
          <p style={{ fontSize: 17, color: '#7A8A9E', lineHeight: 1.8, marginBottom: 36 }}>
            نظام ERP عربي متكامل مصمم للمصانع الصغيرة والورش.
            <strong style={{ color: '#EEF0F6' }}> تتبع الطلبات، الإنتاج، الجودة، والشحن</strong>
            — كل شيء في لوحة واحدة.
          </p>
          <div style={{ display: 'flex', gap: 16, marginBottom: 40 }}>
            <button onClick={() => { setTab('signup'); setModal('signup') }} style={{
              padding: '16px 32px', background: '#C8963E', border: 'none', borderRadius: 14,
              color: '#000', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
            }}>🚀 ابدأ مجاناً ١٤ يوم</button>
            <a href="#features" style={{
              padding: '16px 32px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 14, color: '#EEF0F6', fontSize: 16, textDecoration: 'none', display: 'flex', alignItems: 'center'
            }}>← شوف الميزات</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex' }}>
              {['#D4A843', '#1B7A6E', '#C24B2A', '#6B4FBB', '#2E86AB'].map((c, i) => (
                <div key={i} style={{
                  width: 36, height: 36, borderRadius: '50%', background: c,
                  border: '2px solid #080C12', marginRight: -10, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700
                }}>
                  {['م', 'س', 'ع', 'خ', 'ف'][i]}
                </div>
              ))}
            </div>
            <div style={{ marginRight: 16 }}>
              <div style={{ color: '#C8963E', fontSize: 14 }}>★★★★★</div>
              <div style={{ fontSize: 12, color: '#7A8A9E' }}>انضم <strong style={{ color: '#EEF0F6' }}>+٢٠٠ مصنع</strong> خلال أسبوع الإطلاق</div>
            </div>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div style={{ flex: 1, maxWidth: 480 }}>
          <div style={{ background: '#0D1B2A', borderRadius: 20, border: '1px solid rgba(200,150,62,0.2)', overflow: 'hidden' }}>
            <div style={{ background: '#111927', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {['#E74C3C', '#F39C12', '#2ECC71'].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
              ))}
              <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#7A8A9E' }}>app.sanaai.io/dashboard</div>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'الطلبات النشطة', val: '٢٤', color: '#C8963E' },
                  { label: 'الإيرادات', val: '١٢٨k', color: '#2ECC71' },
                  { label: 'نسبة الإنجاز', val: '٨٧٪', color: '#1ABC9C' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#172030', borderRadius: 10, padding: '12px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: '#7A8A9E', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "'Tajawal', sans-serif" }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#172030', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 12 }}>
                  <span style={{ fontWeight: 700 }}>⚡ آخر الطلبات</span>
                  <span style={{ color: '#7A8A9E' }}>اليوم</span>
                </div>
                {[
                  { av: 'م', c: '#D4A843', name: 'مدرسة النور', status: 'إنتاج', sc: '#C8963E', amt: '٤٥k' },
                  { av: 'ف', c: '#1B7A6E', name: 'فندق ماريوت', status: 'جديد', sc: '#3498DB', amt: '٢٨k' },
                  { av: 'ش', c: '#6B4FBB', name: 'شركة أوراكل', status: 'شحن', sc: '#1ABC9C', amt: '١٨k' },
                  { av: 'ر', c: '#C24B2A', name: 'مطعم روزيتا', status: 'تم ✓', sc: '#2ECC71', amt: '٣٢k' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: r.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{r.av}</div>
                    <div style={{ flex: 1, fontSize: 12 }}>{r.name}</div>
                    <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: `${r.sc}22`, color: r.sc }}>{r.status}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#C8963E' }}>{r.amt}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos Strip */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '20px 60px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 48, fontSize: 13, color: '#7A8A9E', flexWrap: 'wrap' }}>
          <span>يثق بنا:</span>
          {['🏭 مصانع اليونيفورم', '👕 ورش الخياطة', '🏗️ شركات المقاولات', '🍽️ سلاسل المطاعم', '🏫 إدارات المدارس', '🏥 المستشفيات'].map(l => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" style={{ padding: '100px 60px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ color: '#C8963E', fontSize: 13, marginBottom: 12 }}>⚡ المميزات</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 16px', fontFamily: "'Tajawal', sans-serif" }}>كل أدوات المصنع في منصة واحدة</h2>
          <p style={{ color: '#7A8A9E', fontSize: 16 }}>من لحظة استلام الطلب حتى التسليم النهائي — صَنَاعي يغطي كل خطوة.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {[
            { icon: '📦', title: 'إدارة الطلبات الذكية', desc: 'تتبع كل طلب من الاستلام حتى التسليم. رقم تلقائي، حالات لحظية، وتنبيهات فورية عند التأخير.' },
            { icon: '⚙️', title: 'خط الإنتاج المرئي', desc: 'Kanban board بمراحل التصنيع الخمس. تحريك الطلبات بضغطة وتتبع التقدم لحظياً.' },
            { icon: '🔍', title: 'فحص الجودة', desc: 'سجّل نتائج الفحص، أضف الملاحظات، وتتبع معدل القبول والرفض لكل فترة.' },
            { icon: '🚚', title: 'إدارة الشحن', desc: 'تتبع كل شحنة، شركة الشحن، رقم التتبع، وتحديث حالة التسليم بسهولة.' },
            { icon: '🧾', title: 'الفواتير التلقائية', desc: 'فواتير تُنشأ تلقائياً مع كل طلب. تتبع المدفوعات والمتأخرات بتقارير فورية.' },
            { icon: '📊', title: 'تقارير وإحصائيات', desc: 'لوحة تحكم بإحصائيات حية: الإيرادات، الأداء، الطلبات المتأخرة، وأداء الموظفين.' },
          ].map(f => (
            <div key={f.title} style={{
              background: '#111927', borderRadius: 20, padding: 28,
              border: '1px solid rgba(255,255,255,0.05)',
              transition: 'border-color 0.2s'
            }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>{f.title}</h3>
              <p style={{ color: '#7A8A9E', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ padding: '100px 60px', background: '#0D1B2A' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ color: '#C8963E', fontSize: 13, marginBottom: 12 }}>💰 الأسعار</div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 32px', fontFamily: "'Tajawal', sans-serif" }}>ابدأ مجاناً، ادفع لما تنمو</h2>
            <div style={{ display: 'inline-flex', background: '#172030', borderRadius: 12, padding: 4 }}>
              {(['monthly', 'yearly'] as const).map(b => (
                <button key={b} onClick={() => setBilling(b)} style={{
                  padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: billing === b ? '#C8963E' : 'transparent',
                  color: billing === b ? '#000' : '#7A8A9E', fontWeight: 700, fontSize: 14,
                  fontFamily: "'Cairo', sans-serif"
                }}>
                  {b === 'monthly' ? 'شهري' : 'سنوي (-٤٪)'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
            {[
              { name: 'Starter', price: p.starter, users: '٥', featured: false,
                features: ['إدارة الطلبات الكاملة', 'متابعة الإنتاج', 'فحص الجودة', 'الشحن والتسليم', '٥ مستخدمين'],
                dim: ['تقارير PDF', 'API Access', 'دعم أولوية'] },
              { name: 'Professional', price: p.pro, users: '١٥', featured: true,
                features: ['كل مميزات Starter', 'تقارير PDF تلقائية', 'لوحة تحكم متقدمة', 'إشعارات واتساب', '١٥ مستخدم', 'أداء الموظفين', 'نسخ احتياطي يومي'],
                dim: ['API Access'] },
              { name: 'Enterprise', price: p.ent, users: '∞', featured: false,
                features: ['كل مميزات Professional', 'مستخدمين غير محدود', 'API كامل', 'تخصيص كامل', 'مدير حساب مخصص', 'دعم ٢٤/٧', 'SLA ٩٩.٩٪'],
                dim: [] },
            ].map(plan => (
              <div key={plan.name} style={{
                background: plan.featured ? 'rgba(200,150,62,0.08)' : '#111927',
                borderRadius: 20, padding: 28,
                border: `1px solid ${plan.featured ? 'rgba(200,150,62,0.4)' : 'rgba(255,255,255,0.05)'}`,
                position: 'relative'
              }}>
                {plan.featured && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    background: '#C8963E', borderRadius: 8, padding: '4px 16px', fontSize: 12, fontWeight: 700, color: '#000'
                  }}>⭐ الأكثر طلباً</div>
                )}
                <div style={{ fontSize: 16, fontWeight: 700, color: plan.featured ? '#C8963E' : '#EEF0F6', marginBottom: 8 }}>{plan.name}</div>
                <div style={{ fontSize: 36, fontWeight: 900, marginBottom: 4, fontFamily: "'Tajawal', sans-serif" }}>
                  <span style={{ fontSize: 16 }}>ج.م</span> {plan.price}
                </div>
                <div style={{ fontSize: 12, color: '#7A8A9E', marginBottom: 20 }}>{p.label} · حتى {plan.users} مستخدمين</div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 20 }} />
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{ fontSize: 13, color: '#EEF0F6', display: 'flex', gap: 8 }}>
                      <span style={{ color: '#2ECC71' }}>✓</span> {f}
                    </li>
                  ))}
                  {plan.dim.map(f => (
                    <li key={f} style={{ fontSize: 13, color: '#3A4A5E', display: 'flex', gap: 8 }}>
                      <span>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setTab('signup'); setModal('signup') }} style={{
                  width: '100%', padding: '12px 0',
                  background: plan.featured ? '#C8963E' : 'transparent',
                  border: plan.featured ? 'none' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 12, color: plan.featured ? '#000' : '#EEF0F6',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
                }}>
                  {plan.name === 'Enterprise' ? 'تواصل معنا' : 'ابدأ مجاناً ←'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: '100px 60px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ color: '#C8963E', fontSize: 13, marginBottom: 12 }}>💬 آراء العملاء</div>
          <h2 style={{ fontSize: 40, fontWeight: 900, margin: 0, fontFamily: "'Tajawal', sans-serif" }}>مصانع حقيقية، نتائج حقيقية</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {[
            { stars: '★★★★★', text: 'قبل صَنَاعي كنا نشغّل على ورق و WhatsApp. دلوقتي بشوف حالة كل طلب لحظة بلحظة وانخفضت الأخطاء ٩٠٪.', name: 'محمد السيد', role: 'مصنع السيد لليونيفورم — القاهرة', c: '#D4A843', av: 'م' },
            { stars: '★★★★★', text: 'النظام سهل ومريح جداً. موظفيني اتعلموه في يوم واحد. التقارير بتساعدني أاخد قرارات صح.', name: 'سارة العمري', role: 'ورشة سارة للخياطة — الإسكندرية', c: '#1B7A6E', av: 'س' },
            { stars: '★★★★★', text: 'الـ pipeline بتاع الإنتاج ده غيّر طريقة شغلنا كلها. بقينا نسلّم في الموعد ٩٥٪ من الوقت.', name: 'خالد الغامدي', role: 'مصنع النجم — جدة', c: '#6B4FBB', av: 'خ' },
          ].map(t => (
            <div key={t.name} style={{ background: '#111927', borderRadius: 20, padding: 28, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ color: '#C8963E', marginBottom: 16 }}>{t.stars}</div>
              <p style={{ fontSize: 14, lineHeight: 1.8, color: '#7A8A9E', margin: '0 0 20px' }}>{t.text}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{t.av}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#7A8A9E' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: '100px 60px', background: '#0D1B2A' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={{ color: '#C8963E', fontSize: 13, marginBottom: 12 }}>❓ أسئلة شائعة</div>
            <h2 style={{ fontSize: 40, fontWeight: 900, margin: 0, fontFamily: "'Tajawal', sans-serif" }}>كل ما تحتاج معرفته</h2>
          </div>
          {[
            { q: 'هل أحتاج خبرة تقنية؟', a: 'لا على الإطلاق. صَنَاعي مصمم للمصنعيين. الواجهة بالعربي بالكامل وبسيطة جداً.' },
            { q: 'هل بياناتي آمنة؟', a: 'نعم. كل مصنع له بيانات معزولة تماماً. نستخدم تشفير SSL وقواعد بيانات Supabase المؤمنة.' },
            { q: 'إيه اللي بيحصل بعد التجربة المجانية؟', a: 'هنبعتلك تذكير قبل الانتهاء بـ٣ أيام. مفيش أي رسوم تلقائية بدون موافقتك.' },
            { q: 'هل يشتغل على الموبايل؟', a: 'نعم. الداشبورد متجاوب ويشتغل على أي موبايل أو تابلت.' },
            { q: 'هل أقدر أنقل بياناتي؟', a: 'بالطبع. تقدر تصدّر كل شيء بصيغة Excel أو CSV بضغطة زر.' },
          ].map((f, i) => (
            <details key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '20px 0' }}>
              <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 600, listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}>
                {f.q} <span style={{ color: '#C8963E' }}>+</span>
              </summary>
              <p style={{ margin: '12px 0 0', color: '#7A8A9E', fontSize: 14, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '100px 60px', textAlign: 'center', background: 'linear-gradient(135deg, #0D1B2A, #132438)' }}>
        <div style={{ color: '#C8963E', fontSize: 13, marginBottom: 16 }}>🚀 ابدأ الآن</div>
        <h2 style={{ fontSize: 48, fontWeight: 900, margin: '0 0 16px', fontFamily: "'Tajawal', sans-serif" }}>
          مصنعك يستحق <span style={{ color: '#C8963E' }}>نظاماً حقيقياً</span>
        </h2>
        <p style={{ color: '#7A8A9E', fontSize: 16, marginBottom: 36 }}>
          انضم لأكثر من ٢٠٠ مصنع. ابدأ التجربة المجانية — لا يلزم بطاقة ائتمان.
        </p>
        <button onClick={() => { setTab('signup'); setModal('signup') }} style={{
          padding: '18px 48px', background: '#C8963E', border: 'none', borderRadius: 16,
          color: '#000', fontWeight: 700, fontSize: 18, cursor: 'pointer', fontFamily: "'Cairo', sans-serif"
        }}>🚀 ابدأ مجاناً الآن ←</button>
        <p style={{ marginTop: 16, fontSize: 12, color: '#7A8A9E' }}>١٤ يوم مجاناً · بدون بطاقة · إلغاء في أي وقت</p>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '32px 60px', borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#C8963E', fontFamily: "'Tajawal', sans-serif" }}>صَنَاعي</div>
          <div style={{ fontSize: 12, color: '#7A8A9E', marginTop: 4 }}>© ٢٠٢٥ صَنَاعي — تطوير أحمد يوسف · جميع الحقوق محفوظة</div>
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 13, color: '#7A8A9E' }}>
          {['سياسة الخصوصية', 'الشروط والأحكام', 'تواصل معنا'].map(l => (
            <a key={l} href="#" style={{ color: '#7A8A9E', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}