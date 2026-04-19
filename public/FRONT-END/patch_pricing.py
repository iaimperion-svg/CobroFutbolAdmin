import sys
sys.stdout.reconfigure(encoding='utf-8')

NEW_SECTION = '''\
<!-- \u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
     PRECIOS
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<section id="precios" class="bg-alt">
  <div class="container">

    <div class="text-center reveal">
      <span class="section-label">Planes y Precios</span>
      <h2 class="section-title">M\u00e1s barato que<br/><span>una mensualidad de alumno</span></h2>
      <p class="section-subtitle">El plan Semillero parte desde lo que cobra una academia por 1 alumno al mes. Telegram como canal, dashboard de conciliaci\u00f3n incluido.</p>
    </div>

    <!-- PRE-CALENTAMIENTO -->
    <div class="precalentamiento-card reveal">
      <div class="pre-left">
        <div class="pre-badge">ACTIVACI\u00d3N INICIAL</div>
        <div class="pre-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </div>
        <div>
          <h3 class="pre-name">Pre-calentamiento</h3>
          <p class="pre-desc">No le llamamos setup. Le llamamos Pre-calentamiento: 24 horas y tu academia est\u00e1 lista para cobrar en autom\u00e1tico.</p>
        </div>
      </div>
      <div class="pre-center">
        <div class="pre-features">
          <div class="pre-feat"><span class="feat-check"><svg width="13" height="13"><use href="#ic-check"/></svg></span>Configuraci\u00f3n inicial asistida por nuestro equipo</div>
          <div class="pre-feat"><span class="feat-check"><svg width="13" height="13"><use href="#ic-check"/></svg></span>Importaci\u00f3n de tu base de datos desde Excel</div>
          <div class="pre-feat"><span class="feat-check"><svg width="13" height="13"><use href="#ic-check"/></svg></span>Capacitaci\u00f3n en vivo de 1 hora</div>
          <div class="pre-feat"><span class="feat-check"><svg width="13" height="13"><use href="#ic-check"/></svg></span>15 d\u00edas de acceso completo sin cobro mensual</div>
          <div class="pre-feat"><span class="feat-check"><svg width="13" height="13"><use href="#ic-check"/></svg></span>Imputable al primer mes si contratas un plan</div>
        </div>
      </div>
      <div class="pre-right">
        <div class="pre-price-wrap">
          <div class="pre-price"><span class="pre-currency">UF</span><span class="pre-amount">1</span></div>
          <div class="pre-once">pago \u00fanico</div>
          <div class="pre-clp">\u2248 $39.842 CLP</div>
        </div>
        <a href="#contacto" class="btn btn-outline pre-cta" data-onboarding-link>
          <svg width="14" height="14"><use href="#ic-bolt"/></svg> Activar mi academia
        </a>
      </div>
    </div>

    <!-- TOGGLE MENSUAL / ANUAL -->
    <div class="pricing-toggle reveal">
      <span class="pt-label active" id="ptLabelMonth">Mensual</span>
      <button class="pt-switch" id="pricingToggle" role="switch" aria-checked="false" onclick="togglePricing()">
        <span class="pt-thumb"></span>
      </button>
      <span class="pt-label" id="ptLabelYear">Anual <span class="pt-save">Ahorra 20%</span></span>
    </div>

    <!-- \u2588\u2588\u2588 SEMILLERO \u2014 PRODUCT SHOWCASE \u2588\u2588\u2588 -->
    <div class="semillero-product reveal">

      <!-- LEFT: Plan info -->
      <div class="sp-left">
        <div class="sp-entry-badge">PUNTO DE ENTRADA</div>

        <div class="semillero-hook">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          <span>Cuesta desde lo que paga <strong>1 alumno</strong> al mes</span>
        </div>

        <div class="plan-icon" style="margin-bottom:12px;"><svg width="28" height="28"><use href="#ic-ball"/></svg></div>
        <h3 class="sp-plan-name">Semillero</h3>
        <p class="sp-plan-desc">Para academias peque\u00f1as que quieren dejar atr\u00e1s el Excel. Telegram como canal oficial, conciliaci\u00f3n autom\u00e1tica y un dashboard donde ver todo en tiempo real.</p>

        <div class="plan-price" style="margin-top:20px;">
          <span class="plan-currency">UF</span>
          <span class="plan-amount" data-monthly="0.63" data-yearly="0.50">0,63</span>
          <span class="plan-period">/ mes</span>
        </div>
        <div class="plan-equiv">\u2248 $25.000 CLP / mes &mdash; valor de 1 alumno base</div>
        <div class="plan-limit" style="margin-bottom:20px;">Hasta 40 alumnos activos</div>

        <ul class="plan-features sp-features">
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Bot Telegram valida comprobantes con IA</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Familias env\u00edan fotos directamente al bot</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Dashboard de conciliaci\u00f3n en tiempo real</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Recordatorios autom\u00e1ticos, sin perseguir a nadie</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Hasta 3 categor\u00edas activas</li>
          <li class="feat-disabled"><span class="feat-cross"><svg width="14" height="14"><use href="#ic-x"/></svg></span>Reportes exportables (plan Academia)</li>
        </ul>

        <a href="#contacto" class="btn btn-semillero" style="margin-top:24px;" data-onboarding-link data-onboarding-plan="SEMILLERO">
          <svg width="14" height="14"><use href="#ic-bolt"/></svg> Contratar Semillero
        </a>
        <p class="plan-note" style="margin-top:10px;">Sin tarjeta de cr\u00e9dito &nbsp;&middot;&nbsp; Cancela cuando quieras</p>
      </div>

      <!-- RIGHT: DUAL MOCKUP -->
      <div class="sp-right">

        <!-- Telegram Chat Mockup -->
        <div class="tg-mockup">
          <div class="tg-topbar">
            <div class="tg-circles"><span></span><span></span><span></span></div>
            <div class="tg-app-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#2AABEE"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>
              CobroF\u00fatbol Bot
            </div>
            <div class="tg-online">\u25cf en l\u00ednea</div>
          </div>
          <div class="tg-chat">
            <div class="tg-msg tg-bot">
              <div class="tg-bubble">
                <div class="tg-sender">CobroF\u00fatbol</div>
                [Recordatorio] Hola Ana! Tu cuota de <strong>Noviembre ($25.000)</strong> vence ma\u00f1ana. Env\u00eda tu comprobante aqu\u00ed o paga por el link.
                <div class="tg-time">09:14</div>
              </div>
            </div>
            <div class="tg-msg tg-user">
              <div class="tg-bubble">
                <div class="tg-attachment">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  comprobante_nov.jpg
                </div>
                <div class="tg-time tg-time-right">09:17</div>
              </div>
            </div>
            <div class="tg-msg tg-bot">
              <div class="tg-bubble tg-validated">
                <div class="tg-sender">CobroF\u00fatbol</div>
                \u2705 <strong>\u00a1Pago validado!</strong> Familia Garc\u00eda &mdash; $25.000 registrado correctamente en el dashboard.
                <div class="tg-time">09:17</div>
              </div>
            </div>
            <div class="tg-msg tg-bot">
              <div class="tg-bubble">
                <div class="tg-sender">CobroF\u00fatbol</div>
                [Alerta] Quedan <strong>3 pagos pendientes</strong> hoy. Ver dashboard &rarr;
                <div class="tg-time">16:00</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Conciliation Dashboard Mockup -->
        <div class="concil-dash">
          <div class="concil-header">
            <div class="concil-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              Dashboard de Conciliaci\u00f3n
            </div>
            <div class="concil-date">Noviembre 2025</div>
          </div>

          <div class="concil-kpis">
            <div class="concil-kpi">
              <div class="ck-val ck-green">$575.000</div>
              <div class="ck-label">Recaudado hoy</div>
            </div>
            <div class="concil-kpi">
              <div class="ck-val">23</div>
              <div class="ck-label">Pagados</div>
            </div>
            <div class="concil-kpi">
              <div class="ck-val ck-yellow">7</div>
              <div class="ck-label">Pendientes</div>
            </div>
          </div>

          <div class="concil-bar-wrap">
            <div class="concil-bar">
              <div class="concil-fill" style="width:77%"></div>
            </div>
            <span class="concil-pct">77% cobrado</span>
          </div>

          <div class="concil-table">
            <div class="ct-head">
              <span>Familia</span><span>Monto</span><span>Canal</span><span>Estado</span>
            </div>
            <div class="ct-row">
              <span>Garc\u00eda</span><span>$25.000</span>
              <span class="ct-tg"><svg width="11" height="11" viewBox="0 0 24 24" fill="#2AABEE"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c-.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg> TG</span>
              <span class="ct-paid">Pagado</span>
            </div>
            <div class="ct-row">
              <span>Rodr\u00edguez</span><span>$30.000</span>
              <span class="ct-tg"><svg width="11" height="11" viewBox="0 0 24 24" fill="#2AABEE"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c-.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg> TG</span>
              <span class="ct-paid">Pagado</span>
            </div>
            <div class="ct-row ct-row-pending">
              <span>Morales</span><span>$25.000</span>
              <span class="ct-tg"><svg width="11" height="11" viewBox="0 0 24 24" fill="#2AABEE"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c-.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg> TG</span>
              <span class="ct-pending">Pendiente</span>
            </div>
            <div class="ct-row">
              <span>L\u00f3pez</span><span>$30.000</span>
              <span class="ct-tg"><svg width="11" height="11" viewBox="0 0 24 24" fill="#2AABEE"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c-.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg> TG</span>
              <span class="ct-paid">Pagado</span>
            </div>
            <div class="ct-row ct-row-pending">
              <span>Castro</span><span>$25.000</span>
              <span class="ct-tg"><svg width="11" height="11" viewBox="0 0 24 24" fill="#2AABEE"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c-.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg> TG</span>
              <span class="ct-pending">Pendiente</span>
            </div>
          </div>
        </div>

      </div>
    </div><!-- /semillero-product -->

    <!-- Academia + Club Pro en grid 2 col -->
    <div class="pricing-grid-2">

      <!-- ACADEMIA (DESTACADO) -->
      <div class="pricing-card featured reveal stagger-1">
        <div class="plan-badge-popular">EL M\u00c1S ELEGIDO</div>
        <div class="plan-header">
          <div class="plan-icon"><svg width="28" height="28"><use href="#ic-trophy"/></svg></div>
          <h3 class="plan-name">Academia</h3>
          <p class="plan-desc">Cuando tu academia creci\u00f3, tus herramientas tambi\u00e9n deben crecer. Control total del proceso de cobro mes a mes.</p>
        </div>
        <div class="plan-price">
          <span class="plan-currency">UF</span>
          <span class="plan-amount" data-monthly="1.19" data-yearly="0.95">1,19</span>
          <span class="plan-period">/ mes</span>
        </div>
        <div class="plan-equiv" style="color:rgba(57,211,83,.8);">\u2248 $47.412 CLP / mes</div>
        <div class="plan-limit" style="background:rgba(57,211,83,.2);border-color:rgba(57,211,83,.4);">Hasta 150 alumnos activos</div>
        <ul class="plan-features">
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Todo lo de Semillero incluido</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Categor\u00edas ilimitadas</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Reportes en PDF y Excel descargables</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Varios jugadores por familia</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Historial de pagos completo y exportable</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Soporte prioritario por Telegram</li>
          <li class="feat-disabled"><span class="feat-cross"><svg width="14" height="14"><use href="#ic-x"/></svg></span>Multi-sede / multi-rama</li>
        </ul>
        <a href="#contacto" class="btn btn-primary" style="width:100%;justify-content:center;" data-onboarding-link data-onboarding-plan="ACADEMIA">
          <svg width="14" height="14"><use href="#ic-bolt"/></svg> Contratar Academia
        </a>
        <p class="plan-note">Primer mes completamente gratis</p>
      </div>

      <!-- CLUB PRO -->
      <div class="pricing-card reveal stagger-2">
        <div class="plan-header">
          <div class="plan-icon"><svg width="28" height="28"><use href="#ic-layers"/></svg></div>
          <h3 class="plan-name">Club Pro</h3>
          <p class="plan-desc">Para clubes y federaciones que operan en serio. Varias sedes, varios equipos, un solo sistema de cobro.</p>
        </div>
        <div class="plan-price">
          <span class="plan-currency">UF</span>
          <span class="plan-amount" data-monthly="1.79" data-yearly="1.43">1,79</span>
          <span class="plan-period">/ mes</span>
        </div>
        <div class="plan-equiv">\u2248 $71.316 CLP / mes</div>
        <div class="plan-limit">Alumnos ilimitados</div>
        <ul class="plan-features">
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Todo lo de Academia incluido</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Hasta 5 sedes o ramas activas</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Dashboard consolidado multi-sede</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>API para integraci\u00f3n contable</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Gestor de tesorer\u00eda deportiva</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>L\u00ednea directa de soporte telef\u00f3nico</li>
          <li><span class="feat-check"><svg width="14" height="14"><use href="#ic-check"/></svg></span>Onboarding presencial en tu sede</li>
        </ul>
        <a href="#contacto" class="btn btn-outline" style="width:100%;justify-content:center;">Hablar con ventas</a>
        <p class="plan-note">Precio negociable seg\u00fan volumen</p>
      </div>
    </div>

    <!-- NOTA COMERCIAL SEMILLERO -->
    <div class="semillero-note reveal">
      <div class="sn-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="sn-body">
        <strong>Sobre el precio de Semillero:</strong> El plan parte desde el valor mensual de 1 alumno base en academias chilenas (\u2248 $25.000 CLP). Si cobras m\u00e1s por alumno, el costo de CobroFutbol es todav\u00eda menor en proporci\u00f3n. Con ordenar el cobro de 1 solo alumno, ya lo amortizas.
        <span class="sn-sep">&nbsp;\u00b7&nbsp;</span>Valores referenciales en pesos al tipo de cambio UF del d\u00eda.
        <span class="sn-sep">&nbsp;\u00b7&nbsp;</span>IVA incluido.
      </div>
    </div>

  </div>
</section>
'''

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

before = content[:38426]
after  = content[49427:]

result = before + NEW_SECTION + after

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(result)

print("Done. New size:", len(result))
