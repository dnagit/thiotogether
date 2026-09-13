<script setup lang="ts">
/**
 * The way in to the JOOX checklist.
 *
 * There is no sign-up link and no "forgot password": accounts are made in the admin, and the
 * password an admin generated is the only one there has ever been (see the API's
 * `joox-voters` module). So the page says who to ask instead of offering a way round it.
 *
 * Laid out for a phone, and for the way the password actually arrives — pasted or typed off
 * a screenshot of ten random characters. Hence a field that shows what was entered on request,
 * with autocorrect and auto-capitalisation off on both fields: a keyboard "helpfully"
 * capitalising the first letter is the likeliest reason a correct password is refused.
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { applySeo } from '@/composables/useSeo';
import { useJooxAuthStore } from '@/stores/jooxAuth';
import { messageOf } from '@/api/jooxVotes';

applySeo({ title: 'เข้าสู่ระบบโหวต JOOX' });

const route = useRoute();
const router = useRouter();
const auth = useJooxAuthStore();

const username = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref<string | null>(null);
const submitting = ref(false);

/** Where to go once in: back to whatever asked for a login, and to the checklist by default. */
function destination(): string {
  const wanted = route.query.redirect;
  // Only a path of this site, never an absolute URL — a `?redirect=` is attacker-supplied,
  // and following one off-site would make this page an open redirect.
  return typeof wanted === 'string' && wanted.startsWith('/') && !wanted.startsWith('//')
    ? wanted
    : '/joox-vote';
}

// A token still good sends the phone straight through — a fan who voted yesterday never
// sees this page. One that isn't leaves them here, which is where they need to be.
onMounted(async () => {
  if (await auth.restore()) await router.replace(destination());
});

async function submit(): Promise<void> {
  const name = username.value.trim();
  if (!name) {
    error.value = 'กรุณากรอกชื่อผู้ใช้';
    return;
  }
  if (!password.value) {
    error.value = 'กรุณากรอกรหัสผ่าน';
    return;
  }

  submitting.value = true;
  error.value = null;
  try {
    await auth.login(name, password.value);
    await router.replace(destination());
  } catch (err) {
    error.value = messageOf(err, 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');
    password.value = '';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="container-site py-10 sm:py-16 max-w-md">
    <p v-if="auth.checking" class="text-center text-gray-400 py-10 animate-pulse">
      กำลังตรวจสอบการเข้าสู่ระบบ…
    </p>

    <template v-else>
      <header class="text-center mb-6">
        <div class="text-5xl mb-3" aria-hidden="true">🎧</div>
        <h1 class="text-2xl sm:text-3xl font-extrabold mb-1">เข้าสู่ระบบโหวต JOOX</h1>
        <p class="text-sm text-gray-500">ใช้ชื่อผู้ใช้และรหัสผ่านที่ได้รับจากแอดมิน</p>
      </header>

      <form class="card" novalidate @submit.prevent="submit">
        <div class="space-y-3">
          <div>
            <label for="joox-username" class="block text-sm font-medium mb-1">ชื่อผู้ใช้</label>
            <input
              id="joox-username"
              v-model="username"
              type="text"
              maxlength="50"
              autocomplete="username"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="next"
              class="input"
            />
          </div>

          <div>
            <label for="joox-password" class="block text-sm font-medium mb-1">รหัสผ่าน</label>
            <div class="relative">
              <input
                id="joox-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                maxlength="200"
                autocomplete="current-password"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                enterkeyhint="go"
                class="input pr-20"
              />
              <button
                type="button"
                class="tap absolute inset-y-0 right-0 px-3 text-sm font-semibold text-gray-500"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? 'ซ่อน' : 'แสดง' }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="error" class="text-sm text-red-600 mt-3" role="alert">{{ error }}</p>

        <button type="submit" class="tap btn-primary w-full mt-5" :disabled="submitting">
          {{ submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ' }}
        </button>
      </form>

      <p class="text-xs text-gray-400 text-center mt-8">
        ยังไม่มีบัญชี หรือลืมรหัสผ่าน? ติดต่อแอดมินเพื่อขอรหัสผ่านใหม่
      </p>
    </template>
  </div>
</template>

<style scoped>
.card { @apply bg-white border border-gray-100 rounded-2xl p-5 shadow-sm; }
/* 16px text: anything smaller and iOS zooms the page in when the field takes focus. */
.input {
  @apply w-full rounded-lg border border-gray-300 px-4 py-3 text-base
    focus:outline-none focus:ring-2 focus:ring-blue-500;
}
.tap {
  min-height: 48px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  @apply transition active:scale-[0.98];
}

/* The checklist's call-to-action colour, so the way in matches the page it leads to —
   including the near-black text, which is what keeps this yellow readable. */
.btn-primary {
  background: #ffde59;
  @apply text-gray-900;
}
</style>
