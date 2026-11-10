import './components/theme_toggle.js';
import './components/clinic_feature.js';
import './components/care_preview.js';

const navigation = document.querySelector('.site-header nav');
const links = [...navigation.querySelectorAll('a')];
let selectedLink = links[0];

function positionBubble() {
    // Offsets remain relative to the nav, including its padding on mobile.
    navigation.style.setProperty('--bubble-x', `${selectedLink.offsetLeft}px`);
    navigation.style.setProperty('--bubble-y', `${selectedLink.offsetTop}px`);
    navigation.style.setProperty('--bubble-width', `${selectedLink.offsetWidth}px`);
    navigation.style.setProperty('--bubble-height', `${selectedLink.offsetHeight}px`);
}

function updateNavigation() {
    const active = window.location.hash || '#inicio';
    selectedLink = links.find((link) => link.hash === active) || links[0];
    links.forEach((link) => {
        if (link === selectedLink) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
    });
    positionBubble();
}

window.addEventListener('hashchange', updateNavigation);
// Recalculate when the layout or text metrics change, without scroll polling.
const navigationObserver = new ResizeObserver(positionBubble);
navigationObserver.observe(navigation);
links.forEach((link) => navigationObserver.observe(link));
document.fonts.ready.then(positionBubble);
updateNavigation();
// Paint the initial position before enabling movement between selections.
requestAnimationFrame(() => requestAnimationFrame(() => {
    navigation.classList.add('nav-ready');
}));
