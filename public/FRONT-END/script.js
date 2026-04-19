// MOBILE MENU
const defaultAppOrigin = 'https://cobrofutbol.tu-dominio.com';

function getOnboardingEntryUrl() {
    const configuredOrigin =
        document.body?.dataset.appOrigin ||
        window.COBROFUTBOL_APP_URL ||
        defaultAppOrigin;
    return `${configuredOrigin.replace(/\/+$/, '')}/alta`;
}

function configureOnboardingLinks() {
    const onboardingUrl = new URL(getOnboardingEntryUrl());
    document.querySelectorAll('[data-onboarding-link]').forEach(link => {
        if (link instanceof HTMLAnchorElement) {
            const plan = link.dataset.onboardingPlan?.trim().toUpperCase();
            const nextUrl = new URL(onboardingUrl.toString());
            if (plan) {
                nextUrl.searchParams.set('plan', plan);
            }
            link.href = nextUrl.toString();
        }
    });
}

function toggleMobile() {
    const nav = document.getElementById('mobileNav');
    const burger = document.getElementById('hamburger');
    nav.classList.toggle('active');
    burger.classList.toggle('open');
}

function closeMobile() {
    const nav = document.getElementById('mobileNav');
    const burger = document.getElementById('hamburger');
    nav.classList.remove('active');
    burger.classList.remove('open');
}

// SCROLL REVEAL
function revealOnScroll() {
    const reveals = document.querySelectorAll('.reveal');
    reveals.forEach(el => {
        const windowHeight = window.innerHeight;
        const revealPoint = 150;
        const revealTop = el.getBoundingClientRect().top;
        if (revealTop < windowHeight - revealPoint) {
            el.classList.add('visible');
        }
    });
}

// NAVBAR SCROLL EFFECT
function navbarScroll() {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
}

// INIT
window.addEventListener('scroll', () => {
    revealOnScroll();
    navbarScroll();
});

window.addEventListener('load', () => {
    configureOnboardingLinks();
    revealOnScroll();
    navbarScroll();
    
    // Smooth scroll for anchors
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                window.scrollTo({
                    top: target.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });
});

// FAQ ACCORDION
function toggleFaq(element) {
    const parent = element.parentElement;
    parent.classList.toggle('active');
}

// PRICING TOGGLE
function togglePricing() {
    const isYearly = document.getElementById('pricingToggle').checked;
    const amounts = document.querySelectorAll('.price .amount');
    
    document.getElementById('ptLabelMonth').classList.toggle('active', !isYearly);
    document.getElementById('ptLabelYear').classList.toggle('active', isYearly);
    
    amounts.forEach(amt => {
        amt.style.opacity = '0';
        setTimeout(() => {
            amt.textContent = isYearly ? amt.getAttribute('data-yearly') : amt.getAttribute('data-monthly');
            amt.style.opacity = '1';
        }, 200);
    });
}

// FORM SUBMISSION (Mockup)
function submitForm(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmit');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin" style="margin-right:8px"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg> Procesando...';
    btn.style.opacity = '0.8';
    
    setTimeout(() => {
        btn.innerHTML = '¡Solicitud Enviada!';
        btn.style.background = 'var(--green)';
        btn.style.opacity = '1';
        
        setTimeout(() => {
            document.getElementById('contactForm').reset();
            btn.innerHTML = originalText;
            btn.style.background = 'var(--green-light)';
        }, 3000);
    }, 1500);
}
