// Applique le thème clair/sombre enregistré (même clé que app/theme.ts).
(function(){var t='auto';try{t=localStorage.getItem('vitepress-theme-appearance')||'auto'}catch(e){}document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))})()
