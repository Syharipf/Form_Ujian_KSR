export const THEME_KEY = 'theme'

// Runs before first paint (see app/layout.tsx) so a saved choice never flashes the other theme.
export const themeScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`
