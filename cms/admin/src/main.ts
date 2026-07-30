import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { permissionDirective } from './directives/permission';

/**
 * Element Plus styles are imported on demand by the auto-import resolver, but only
 * for components it finds as tags in templates. `ElMessage`, `ElMessageBox` and
 * `ElNotification` are called from JavaScript, so the resolver imports the function
 * and never the stylesheet — leaving those dialogs completely unstyled (unpositioned
 * block in the top-left corner, no icon background, everything flush left).
 * Import their CSS by hand.
 */
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/notification/style/css';

import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('permission', permissionDirective);
app.mount('#app');
