import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { escapeInAppBrowser } from './utils/externalBrowser';
import './styles/main.css';

// Before the app boots: a page opened from LINE hands itself to the default browser.
escapeInAppBrowser();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
