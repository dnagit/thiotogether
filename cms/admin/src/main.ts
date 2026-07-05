import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { permissionDirective } from './directives/permission';
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('permission', permissionDirective);
app.mount('#app');
