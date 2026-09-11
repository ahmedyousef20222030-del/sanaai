'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LandingPage() {
  const router = useRouter()
  const [modal, setModal] = useState<'signup' | 'login' | null>(null)
  const [tab, setTab] = useState<'signup' | 'login'>('signup')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'error' | 'info' } | null>(null)
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')

  const [signup, setSignup] = useState({ factory: '', name: '', email: '', password: '' })
  const [login, setLogin] = useState({ email: '', password: '' })
  
  // ── عداد المصانع (الرقم الحقيقي من قاعدة البيانات عبر دالة RPC) ──
  const [registeredFactories, setRegisteredFactories] = useState<number>(0)
  const TARGET_FACTORIES = 200
  const progressPercentage = Math.min((registeredFactories / TARGET_FACTORIES) * 100, 100)

  // جلب العدد الفعلي بمجرد تحميل الصفحة عبر الدالة الآمنة (RPC)
  useEffect(() => {
    async function fetchRealCount() {
      const { data, error } = await supabase.rpc('get_active_tenants_count')
      
      if (!error && data !== null) {
        setRegisteredFactories(data)
      }
    }
    fetchRealCount()
  }, [])

  function showToast(msg: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') {
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
    monthly: { starter: '2000', ent: '4000', label: 'شهرياً' },
    yearly:  { starter: '20000', ent: '40000', label: 'يُدفع سنوياً' },
  }
  const p = prices[billing]

  const toastStyles = {
    success: 'bg-[#111927] border-[#1B7A6E] text-[#1B7A6E]',
    warning: 'bg-[#111927] border-[#C8963E] text-[#C8963E]',
    error: 'bg-[#111927] border-[#C24B2A] text-[#C24B2A]',
    info: 'bg-[#111927] border-[#3498DB] text-[#3498DB]',
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#080C12] text-[#EEF0F6] font-sans selection:bg-[#C8963E]/30 overflow-x-hidden" style={{ fontFamily: "'Cairo', sans-serif" }}>
      
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 py-3.5 md:px-12 lg:px-20 bg-[#080C12]/90 backdrop-blur-xl border-b border-[#C8963E]/15">
        <div className="text-xl md:text-2xl font-black text-[#C8963E] tracking-tight">
          🏭 صَنَا<span className="text-[#EEF0F6]">عي</span>
        </div>
        <div className="hidden lg:flex items-center gap-8 text-sm font-bold text-[#7A8A9E]">
          <a href="#features" className="hover:text-white transition">المميزات</a>
          <a href="#pricing" className="hover:text-white transition">الأسعار</a>
          <a href="#faq" className="hover:text-white transition">الأسئلة</a>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => { setTab('login'); setModal('login') }} className="px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-bold border border-white/15 rounded-xl hover:bg-white/5 transition">
            دخول
          </button>
          <button onClick={() => { setTab('signup'); setModal('signup') }} className="px-4 py-1.5 md:px-5 md:py-2 text-xs md:text-sm font-bold bg-[#C8963E] text-black rounded-xl hover:bg-[#D4A843] transition shadow-lg shadow-[#C8963E]/20">
            ابدأ ٧ أيام مجاناً
          </button>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <header className="px-6 py-10 md:py-16 lg:py-20 max-w-[1200px] mx-auto flex flex-col lg:flex-row items-center gap-8 lg:gap-12">
        <div className="flex-1 text-center lg:text-right">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#C8963E]/10 border border-[#C8963E]/20 rounded-full text-xs font-bold text-[#C8963E] mb-5">
            <span className="w-1.5 h-1.5 bg-[#C8963E] rounded-full animate-pulse" />
            الإطلاق الرسمي — النسخة ١.٠
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight mb-5" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            <span className="block text-white">أدِر مصنعك</span>
            <span className="block text-[#C8963E]">بذكاء حقيقي</span>
            <span className="block text-transparent" style={{ WebkitTextStroke: '1px #EEF0F6' }}>من مكان واحد</span>
          </h1>
          <p className="text-base md:text-lg text-[#7A8A9E] leading-relaxed mb-6 max-w-2xl mx-auto lg:mx-0">
            نظام ERP عربي متكامل مصمم للمصانع الصغيرة والورش.
            <strong className="text-[#EEF0F6]"> تتبع الطلبات، الإنتاج، الجودة، والشحن</strong> — كل شيء في لوحة واحدة.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-8">
            <button onClick={() => { setTab('signup'); setModal('signup') }} className="w-full sm:w-auto px-6 py-3.5 bg-[#C8963E] text-black font-black rounded-2xl hover:bg-[#D4A843] transition shadow-lg shadow-[#C8963E]/20 text-sm md:text-base">
              🚀 ابدأ ٧ أيام مجاناً
            </button>
            <a href="#features" className="w-full sm:w-auto px-6 py-3.5 border border-white/15 text-white font-bold rounded-2xl hover:bg-white/5 transition flex items-center justify-center gap-2 text-sm md:text-base">
              ← شوف الميزات
            </a>
          </div>

          {/* ── عداد المصانع ── */}
          <div className="bg-[#111927] border border-[#C8963E]/20 rounded-2xl p-4 md:p-5 shadow-2xl relative overflow-hidden text-right max-w-lg mx-auto lg:mx-0">
            <div className="absolute top-0 right-0 w-full h-1 bg-white/5">
              <div className="h-full bg-[#C8963E] transition-all duration-1000" style={{ width: `${progressPercentage}%` }} />
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm md:text-base font-bold text-white">🚀 انضم لـ ٢٠٠ مصنع شركاء نجاح أول مرحلة</h3>
              <span className="text-2xl font-black text-[#C8963E]">
                {registeredFactories > 0 ? registeredFactories : <span className="animate-pulse opacity-50">...</span>}
              </span>
            </div>
            
            <div className="w-full bg-[#080C12] rounded-full h-2 mb-2.5 border border-white/5 overflow-hidden">
              <div className="bg-gradient-to-r from-[#D4A843] to-[#C8963E] h-full rounded-full relative" style={{ width: `${progressPercentage}%` }}>
                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              </div>
            </div>
            <p className="text-[11px] md:text-xs text-[#7A8A9E] font-bold">
              ⚡ احصل على خصم ٤٠٪ شهري أو ٦٠٪ سنوي.. <span className="text-[#C8963E]">والسعر يثبت لمدة ٥ سنين!</span>
            </p>
          </div>
        </div>

        {/* ── Dashboard Preview ── */}
        <div className="flex-1 w-full max-w-lg hidden md:block">
          <div className="bg-[#0D1B2A] rounded-3xl border border-[#C8963E]/20 overflow-hidden shadow-2xl shadow-[#C8963E]/10">
            <div className="bg-[#111927] px-4 py-3 flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#E74C3C]" />
              <div className="w-3 h-3 rounded-full bg-[#F39C12]" />
              <div className="w-3 h-3 rounded-full bg-[#2ECC71]" />
              <div className="flex-1 text-center text-xs text-[#7A8A9E] font-mono">app.sanaai.io/dashboard</div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'الطلبات النشطة', val: '٢٤', color: 'text-[#C8963E]' },
                  { label: 'الإيرادات', val: '١٢٨k', color: 'text-[#2ECC71]' },
                  { label: 'نسبة الإنجاز', val: '٨٧٪', color: 'text-[#1ABC9C]' },
                ].map((s, i) => (
                  <div key={i} className="bg-[#172030] rounded-xl p-3 text-center">
                    <div className="text-[10px] text-[#7A8A9E] mb-1">{s.label}</div>
                    <div className={`text-lg md:text-xl font-black ${s.color}`} style={{ fontFamily: "'Tajawal', sans-serif" }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div className="bg-[#172030] rounded-2xl p-4">
                <div className="flex justify-between items-center mb-3 text-xs">
                  <span className="font-bold text-white">⚡ آخر الطلبات</span>
                  <span className="text-[#7A8A9E]">اليوم</span>
                </div>
                {[
                  { av: 'م', bg: 'bg-[#D4A843]', name: 'مدرسة النور', status: 'إنتاج', sColor: 'text-[#C8963E] bg-[#C8963E]/10', amt: '٤٥k' },
                  { av: 'ف', bg: 'bg-[#1B7A6E]', name: 'فندق ماريوت', status: 'جديد', sColor: 'text-[#3498DB] bg-[#3498DB]/10', amt: '٢٨k' },
                  { av: 'ش', bg: 'bg-[#6B4FBB]', name: 'شركة أوراكل', status: 'شحن', sColor: 'text-[#1ABC9C] bg-[#1ABC9C]/10', amt: '١٨k' },
                  { av: 'ر', bg: 'bg-[#C24B2A]', name: 'مطعم روزيتا', status: 'تم ✓', sColor: 'text-[#2ECC71] bg-[#2ECC71]/10', amt: '٣٢k' },
                ].map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 py-2 ${i < 3 ? 'border-b border-white/5' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${r.bg}`}>{r.av}</div>
                    <div className="flex-1 text-xs font-medium">{r.name}</div>
                    <div className={`text-[10px] px-2 py-0.5 rounded font-bold ${r.sColor}`}>{r.status}</div>
                    <div className="text-xs font-bold text-[#C8963E] w-10 text-left">{r.amt}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Logos Strip ── */}
      <div className="border-y border-white/5 py-4 px-6 overflow-hidden bg-[#0D1B2A]/50">
        <div className="flex items-center justify-center flex-wrap gap-4 md:gap-8 text-xs md:text-sm font-bold text-[#7A8A9E] max-w-6xl mx-auto">
          <span className="text-white">يثق بنا:</span>
          {['🏭 مصانع اليونيفورم', '👕 ورش الخياطة', 'مصانع ملابس', 'محلات ملابس بفروع', 'تصنيع للغير', 'ورش تطريز'].map(l => (
            <span key={l} className="hover:text-white transition cursor-default">{l}</span>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section id="features" className="px-6 py-12 md:py-16 max-w-[1200px] mx-auto">
        <div className="text-center mb-10">
          <div className="text-[#C8963E] text-xs md:text-sm font-bold mb-2">⚡ المميزات</div>
          <h2 className="text-3xl md:text-4xl font-black mb-3" style={{ fontFamily: "'Tajawal', sans-serif" }}>كل أدوات المصنع في منصة واحدة</h2>
          <p className="text-[#7A8A9E] text-sm md:text-base">من لحظة استلام الطلب حتى التسليم النهائي — صَنَاعي يغطي كل خطوة.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: '📦', title: 'إدارة الطلبات الذكية', desc: 'تتبع كل طلب من الاستلام حتى التسليم. رقم تلقائي، حالات لحظية، وتنبيهات فورية عند التأخير.' },
            { icon: '⚙️', title: 'خط الإنتاج المرئي', desc: 'Kanban board بمراحل التصنيع الخمس. تحريك الطلبات بضغطة وتتبع التقدم لحظياً.' },
            { icon: '🔍', title: 'فحص الجودة', desc: 'سجّل نتائج الفحص، أضف الملاحظات، وتتبع معدل القبول والرفض لكل فترة.' },
            { icon: '🚚', title: 'إدارة الشحن', desc: 'تتبع كل شحنة، شركة الشحن، رقم التتبع، وتحديث حالة التسليم بسهولة.' },
            { icon: '🧾', title: 'الفواتير التلقائية', desc: 'فواتير تُنشأ تلقائياً مع كل طلب. تتبع المدفوعات والمتأخرات بتقارير فورية.' },
            { icon: '📊', title: 'تقارير وإحصائيات', desc: 'لوحة تحكم بإحصائيات حية: الإيرادات، الأداء، الطلبات المتأخرة، وأداء الموظفين.' },
          ].map(f => (
            <div key={f.title} className="bg-[#111927] rounded-2xl p-6 border border-white/5 hover:border-[#C8963E]/30 transition-all group">
              <div className="text-3xl mb-4 transform group-hover:scale-110 transition-transform">{f.icon}</div>
              <h3 className="text-base md:text-lg font-bold mb-2 text-white">{f.title}</h3>
              <p className="text-[#7A8A9E] text-xs md:text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="px-6 py-12 md:py-16 bg-[#0D1B2A] border-y border-white/5">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-10">
            <div className="text-[#C8963E] text-xs md:text-sm font-bold mb-2">💰 الأسعار</div>
            <h2 className="text-3xl md:text-4xl font-black mb-4 leading-tight" style={{ fontFamily: "'Tajawal', sans-serif" }}>
              ابدأ مجاناً.. وادفع على قد حجم مصنعك!
            </h2>
            <p className="text-sm md:text-base text-[#EEF0F6] mb-4 max-w-2xl mx-auto">
              كل مميزات "صَنَاعي" الجبارة مفتوحة ليك بالكامل، مفيش أي ميزة مقفولة. اختار باقتك بناءً على حجم فريقك وعدد فروعك بس!
            </p>
            <p className="text-xs md:text-sm text-[#C8963E] font-bold mb-6 bg-[#C8963E]/10 py-2.5 px-5 rounded-2xl inline-block border border-[#C8963E]/20">
              🔥 كن من الـ ٢٠٠ مصنع (شركاء نجاح المرحلة الأولى) واستفاد بخصم ٤٠٪ للشهري و٦٠٪ للسنوي.. مع تثبيت سعرك لمدة ٥ سنين!
            </p>
            
            <div className="flex justify-center mb-4">
              <div className="inline-flex bg-[#172030] p-1.5 rounded-2xl border border-white/5 shadow-inner">
                {(['monthly', 'yearly'] as const).map(b => (
                  <button key={b} onClick={() => setBilling(b)} className={`px-6 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${billing === b ? 'bg-[#C8963E] text-black shadow-md' : 'text-[#7A8A9E] hover:text-white'}`}>
                    {b === 'monthly' ? 'الاشتراك الشهري' : 'الاشتراك السنوي'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-8">
            {[
              { 
                name: 'الباقة الأولى: الأساسية (Starter)', 
                subtitle: 'مثالية للورش والمصانع اللي بتدور على التنظيم والتحول الرقمي',
                price: p.starter, 
                users: '١٠', 
                scope: 'فرع / مصنع واحد',
                featured: false, 
                features: [
                  'إدارة الطلبات: من الاستلام للتسليم مع فواتير أوتوماتيكية.', 
                  'خط الإنتاج المرئي: (Kanban Board) وتتبع العمال.', 
                  'التحكم في المخازن: معادلة التصنيع (BOM) والخصم الآلي للخامات.', 
                  'الجودة والشحن: فحص المنتجات وطباعة بوالص الشحن.', 
                  'تقارير وإحصائيات: لوحة تحكم كاملة لإيراداتك وتارجت الإنتاج.',
                  'دعم فني قياسي (شات وإيميل).'
                ]
              },
              { 
                name: 'الباقة الثانية: الشركات (Enterprise)', 
                subtitle: 'مثالية للمصانع الكبيرة اللي بتدير أكتر من عنبر إنتاج أو معرض بيع',
                price: p.ent, 
                users: '٣٠', 
                scope: 'فروع متعددة (مصانع، مخازن خارجية، معارض)',
                featured: true, 
                features: [
                  'كل مميزات الباقة الأساسية بالكامل ➕', 
                  'إدارة الفروع المتعددة: راقب كل فروعك ومعارضك من شاشة واحدة.', 
                  'تقارير مجمعة: قارن أداء ومبيعات وتارجت كل فرع لوحده.', 
                  'صلاحيات متقدمة جداً: تحكم دقيق في اللي يشوفه كل موظف بين الفروع.', 
                  'ربط API كامل: لو حابب تربط صَنَاعي بأي سيستم تاني عندك.', 
                  'مدير حساب مخصص: بيتابع معاك ويدرب فريقك.', 
                  'دعم فني أولوية VIP (٢٤/٧).'
                ]
              },
            ].map(plan => (
              <div key={plan.name} className={`rounded-3xl p-6 md:p-8 flex flex-col relative transition-transform ${plan.featured ? 'bg-[#C8963E]/5 border-2 border-[#C8963E]/40 transform md:-translate-y-2 shadow-xl shadow-[#C8963E]/10' : 'bg-[#111927] border border-white/5'}`}>
                {plan.featured && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#C8963E] text-black px-5 py-1 rounded-full text-[11px] md:text-xs font-black shadow-lg shadow-[#C8963E]/20">⭐️ الأكثر طلباً</div>
                )}
                
                <div className={`text-lg font-black mb-1.5 ${plan.featured ? 'text-[#C8963E]' : 'text-white'}`}>{plan.name}</div>
                <div className="text-[11px] md:text-xs text-[#7A8A9E] mb-5 font-medium leading-relaxed min-h-[36px]">{plan.subtitle}</div>
                
                <div className="text-3xl md:text-4xl font-black mb-1.5" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  <span className="text-base text-gray-400 font-medium">ج.م</span> {plan.price}
                </div>
                <div className="text-xs text-[#7A8A9E] font-bold mb-4">
                  {p.label}
                </div>

                <div className="bg-[#080C12] border border-white/5 rounded-xl p-3.5 mb-6">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[11px] text-[#7A8A9E] font-bold">المستخدمين:</span>
                    <span className="text-[11px] text-white font-bold">حتى {plan.users} مستخدمين</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-[#7A8A9E] font-bold">حجم العمل:</span>
                    <span className="text-[11px] text-[#C8963E] font-bold">{plan.scope}</span>
                  </div>
                </div>

                <div className="text-xs font-bold text-white mb-3">المميزات (كل السيستم مفتوح):</div>
                <ul className="flex-1 space-y-3 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] md:text-xs font-medium text-[#EEF0F6] leading-relaxed">
                      <span className="text-[#2ECC71] font-bold">✓</span> {f}
                    </li>
                  ))}
                </ul>
                
                <button onClick={() => { setTab('signup'); setModal('signup') }} className={`w-full py-3.5 rounded-xl font-black transition-all text-xs md:text-sm ${plan.featured ? 'bg-[#C8963E] text-black hover:bg-[#D4A843] shadow-md shadow-[#C8963E]/20' : 'border border-[#C8963E]/30 text-[#C8963E] hover:bg-[#C8963E]/10'}`}>
                  🚀 ابدأ ٧ أيام مجاناً ←
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="px-6 py-12 md:py-16 max-w-[1200px] mx-auto">
        <div className="text-center mb-10">
          <div className="text-[#C8963E] text-xs md:text-sm font-bold mb-2">💬 آراء العملاء</div>
          <h2 className="text-3xl md:text-4xl font-black" style={{ fontFamily: "'Tajawal', sans-serif" }}>مصانع حقيقية، نتائج حقيقية</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {[
            { stars: '★★★★★', text: 'قبل صَنَاعي كنا نشغّل على ورق و WhatsApp. دلوقتي بشوف حالة كل طلب لحظة بلحظة وانخفضت الأخطاء ٩٠٪.', name: 'محمد السيد', role: 'مصنع السيد لليونيفورم — القاهرة', bg: 'bg-[#D4A843]', av: 'م' },
            { stars: '★★★★★', text: 'النظام سهل ومريح جداً. موظفيني اتعلموه في يوم واحد. التقارير بتساعدني أاخد قرارات صح.', name: 'سارة العمري', role: 'ورشة سارة للخياطة — الإسكندرية', bg: 'bg-[#1B7A6E]', av: 'س' },
            { stars: '★★★★★', text: 'الـ pipeline بتاع الإنتاج ده غيّر طريقة شغلنا كلها. بقينا نسلّم في الموعد ٩٥٪ من الوقت.', name: 'خالد الغامدي', role: 'مصنع النجم — جدة', bg: 'bg-[#6B4FBB]', av: 'خ' },
          ].map(t => (
            <div key={t.name} className="bg-[#111927] rounded-2xl p-6 border border-white/5">
              <div className="text-[#C8963E] mb-3 text-lg tracking-widest">{t.stars}</div>
              <p className="text-[#7A8A9E] text-xs md:text-sm leading-relaxed mb-5">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white ${t.bg}`}>{t.av}</div>
                <div>
                  <div className="text-xs font-bold text-white mb-0.5">{t.name}</div>
                  <div className="text-[10px] md:text-xs text-[#7A8A9E] font-medium">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="px-6 py-12 md:py-16 bg-[#0D1B2A] border-y border-white/5">
        <div className="max-w-[700px] mx-auto">
          <div className="text-center mb-10">
            <div className="text-[#C8963E] text-xs md:text-sm font-bold mb-2">❓ أسئلة شائعة</div>
            <h2 className="text-3xl md:text-4xl font-black" style={{ fontFamily: "'Tajawal', sans-serif" }}>كل ما تحتاج معرفته</h2>
          </div>
          <div className="space-y-3">
            {[
              { q: 'هل أحتاج خبرة تقنية؟', a: 'لا على الإطلاق. صَنَاعي مصمم للمصنعيين. الواجهة بالعربي بالكامل وبسيطة جداً.' },
              { q: 'هل بياناتي آمنة؟', a: 'نعم. كل مصنع له بيانات معزولة تماماً. نستخدم تشفير SSL وقواعد بيانات Supabase المؤمنة.' },
              { q: 'إيه اللي بيحصل بعد الـ ٧ أيام المجانية؟', a: 'هنبعتلك تذكير قبل الانتهاء. مفيش أي رسوم تلقائية هتتخصم بدون موافقتك الصريحة.' },
              { q: 'هل يشتغل على الموبايل؟', a: 'نعم. الداشبورد متجاوب ويشتغل على أي موبايل أو تابلت.' },
              { q: 'هل أقدر أنقل بياناتي؟', a: 'بالطبع. تقدر تصدّر كل شيء بصيغة Excel أو CSV بضغطة زر.' },
            ].map((f, i) => (
              <details key={i} className="group bg-[#111927] border border-white/5 rounded-2xl p-5 open:border-[#C8963E]/30 transition-all cursor-pointer">
                <summary className="font-bold text-sm md:text-base text-white list-none flex justify-between items-center outline-none">
                  {f.q} 
                  <span className="text-[#C8963E] text-xl font-normal group-open:rotate-45 transition-transform duration-300">+</span>
                </summary>
                <p className="mt-3 text-xs md:text-sm text-[#7A8A9E] leading-relaxed border-t border-white/5 pt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="px-6 py-16 md:py-20 text-center bg-gradient-to-br from-[#0D1B2A] to-[#132438]">
        <div className="text-[#C8963E] text-xs md:text-sm font-bold mb-3">🚀 ابدأ الآن و نظم مصنعك</div>
        <h2 className="text-3xl md:text-5xl font-black mb-5" style={{ fontFamily: "'Tajawal', sans-serif" }}>
          مصنعك يستحق <span className="text-[#C8963E]">نظاماً حقيقياً</span>
        </h2>
        <p className="text-[#7A8A9E] text-sm md:text-base mb-8 max-w-2xl mx-auto leading-relaxed">
          انضم لـ ٢٠٠ مصنع شركاء نجاح أول مرحلة واستفد من تثبيت السعر لمدة ٥ سنين. ابدأ التجربة المجانية لمدة ٧ أيام — لا يلزم بطاقة ائتمان.
        </p>
        <button onClick={() => { setTab('signup'); setModal('signup') }} className="px-8 py-4 bg-[#C8963E] text-black font-black rounded-2xl hover:bg-[#D4A843] transition shadow-xl shadow-[#C8963E]/20 text-sm md:text-base">
          🚀 ابدأ ٧ أيام مجاناً ←
        </button>
        <p className="mt-5 text-[11px] md:text-xs font-bold text-[#7A8A9E]">٧ أيام مجاناً · بدون بطاقة ائتمان · إلغاء في أي وقت</p>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-6 px-6 md:px-16 flex flex-col md:flex-row justify-between items-center gap-4 bg-[#080C12]">
        <div className="text-center md:text-right">
          <div className="text-lg md:text-xl font-black text-[#C8963E] mb-1" style={{ fontFamily: "'Tajawal', sans-serif" }}>صَنَاعي</div>
          <div className="text-[10px] md:text-xs text-[#7A8A9E] font-medium">© 2026 صَنَاعي — تطوير حلول الويب بواسطة أحمد يوسف · جميع الحقوق محفوظة</div>
        </div>
        <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-[11px] md:text-xs font-bold text-[#7A8A9E]">
          {['سياسة الخصوصية', 'الشروط والأحكام', 'تواصل معنا 01069936787'].map(l => (
            <a key={l} href="#" className="hover:text-white transition">{l}</a>
          ))}
        </div>
      </footer>

      {/* ── Toast (Mobile Friendly) ── */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl z-[9999] text-xs md:text-sm font-bold whitespace-nowrap shadow-2xl transition-all border ${toastStyles[toast.type]}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Auth Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={() => setModal(null)}>
          <div className="w-full max-w-md bg-[#0D1B2A] rounded-3xl p-6 md:p-8 border border-[#C8963E]/20 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setModal(null)} className="absolute top-4 left-4 text-gray-500 hover:text-white transition text-lg">✕</button>
            
            <div className="flex gap-3 mb-6 border-b border-white/10 pb-3">
              <button onClick={() => setTab('signup')} className={`flex-1 text-sm md:text-base font-bold pb-2 border-b-2 transition-all ${tab === 'signup' ? 'text-[#C8963E] border-[#C8963E]' : 'text-[#7A8A9E] border-transparent hover:text-white'}`}>إنشاء حساب</button>
              <button onClick={() => setTab('login')} className={`flex-1 text-sm md:text-base font-bold pb-2 border-b-2 transition-all ${tab === 'login' ? 'text-[#C8963E] border-[#C8963E]' : 'text-[#7A8A9E] border-transparent hover:text-white'}`}>تسجيل دخول</button>
            </div>

            {tab === 'signup' ? (
              <div className="space-y-3.5">
                <h2 className="text-lg md:text-xl font-bold text-white mb-4">ابدأ تجربتك المجانية</h2>
                <div>
                  <input type="text" placeholder="اسم المصنع / الورشة *" value={signup.factory} onChange={e => setSignup({...signup, factory: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs md:text-sm text-white focus:border-[#C8963E]/50 outline-none transition placeholder-gray-500" />
                </div>
                <div>
                  <input type="text" placeholder="الاسم بالكامل *" value={signup.name} onChange={e => setSignup({...signup, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs md:text-sm text-white focus:border-[#C8963E]/50 outline-none transition placeholder-gray-500" />
                </div>
                <div>
                  <input type="email" placeholder="البريد الإلكتروني *" value={signup.email} onChange={e => setSignup({...signup, email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs md:text-sm text-white focus:border-[#C8963E]/50 outline-none transition text-left placeholder-gray-500 text-right focus:text-left dir-auto" />
                </div>
                <div>
                  <input type="password" placeholder="كلمة المرور (٨ أحرف+) *" value={signup.password} onChange={e => setSignup({...signup, password: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs md:text-sm text-white focus:border-[#C8963E]/50 outline-none transition text-left placeholder-gray-500 text-right focus:text-left dir-auto" />
                </div>
                <button onClick={handleSignup} disabled={loading} className="w-full py-3.5 mt-2 bg-[#C8963E] text-black font-bold rounded-xl hover:bg-[#D4A843] transition disabled:opacity-50 text-sm">
                  {loading ? 'جاري الإنشاء...' : '🚀 ابدأ ٧ أيام مجاناً'}
                </button>
                <p className="text-[10px] md:text-[11px] text-[#7A8A9E] text-center font-bold mt-2">بدون بطاقة ائتمان · إلغاء في أي وقت</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                <h2 className="text-lg md:text-xl font-bold text-white mb-4">مرحباً بعودتك</h2>
                <div>
                  <input type="email" placeholder="البريد الإلكتروني" value={login.email} onChange={e => setLogin({...login, email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs md:text-sm text-white focus:border-[#C8963E]/50 outline-none transition text-left placeholder-gray-500 text-right focus:text-left dir-auto" />
                </div>
                <div>
                  <input type="password" placeholder="كلمة المرور" value={login.password} onChange={e => setLogin({...login, password: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs md:text-sm text-white focus:border-[#C8963E]/50 outline-none transition text-left placeholder-gray-500 text-right focus:text-left dir-auto" />
                </div>
                <button onClick={handleLogin} disabled={loading} className="w-full py-3.5 mt-2 bg-[#C8963E] text-black font-bold rounded-xl hover:bg-[#D4A843] transition disabled:opacity-50 text-sm">
                  {loading ? 'جاري الدخول...' : '🔐 تسجيل الدخول'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}