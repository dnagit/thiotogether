<script setup lang="ts">
/**
 * Donation flow, single page:
 * project info → progress → bank accounts → donation form → slip upload
 * (drag & drop + preview) → submit → confirmation with donation code.
 */
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/client';
import { get } from '@/api/client';
import { applySeo } from '@/composables/useSeo';
import { formatCurrency, type BankAccount, type DonationProject } from '@cms/shared';

const route = useRoute();
const router = useRouter();

const project = ref<DonationProject | null>(null);
const loading = ref(true);

const form = reactive({
  accountName: '',
  amount: null as number | null,
  transferDate: new Date().toISOString().slice(0, 10),
  transferTime: new Date().toTimeString().slice(0, 5),
  remark: '',
});
const slipFile = ref<File | null>(null);
const slipPreview = ref<string | null>(null);
const dragOver = ref(false);
const errors = reactive<Record<string, string>>({});
const submitting = ref(false);
const result = ref<{ donationCode: string; projectName: string; status: string } | null>(null);

void get<DonationProject>(`/donation-projects/${route.params.slug}`)
  .then((p) => {
    project.value = p;
    applySeo({
      title: p.metaTitle || p.name,
      metaDescription: p.metaDescription || p.shortDescription || undefined,
      ogImage: p.ogImage || p.coverImage || undefined,
    });
  })
  .catch(() => void router.replace({ name: 'not-found' }))
  .finally(() => (loading.value = false));

const banks = computed<BankAccount[]>(() => (project.value?.bankAccounts as BankAccount[]) ?? []);
const stats = computed(() => project.value?.stats);
const themeColor = computed(() => project.value?.themeColor ?? 'var(--color-primary)');
const campaignEnded = computed(
  () => !!project.value?.endDate && new Date(project.value.endDate) < new Date(),
);

function setSlip(file: File | undefined | null): void {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    errors.slip = 'Please upload an image of your transfer slip';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    errors.slip = 'File must be under 10 MB';
    return;
  }
  delete errors.slip;
  slipFile.value = file;
  const reader = new FileReader();
  reader.onload = () => (slipPreview.value = String(reader.result));
  reader.readAsDataURL(file);
}

function onDrop(e: DragEvent): void {
  dragOver.value = false;
  setSlip(e.dataTransfer?.files?.[0]);
}

function validate(): boolean {
  for (const key of Object.keys(errors)) delete errors[key];
  if (!form.accountName.trim()) errors.accountName = 'Your name is required';
  if (!form.amount || form.amount <= 0) errors.amount = 'Enter the donation amount';
  if (!form.transferDate) errors.transferDate = 'Transfer date is required';
  if (!form.transferTime) errors.transferTime = 'Transfer time is required';
  if (!slipFile.value) errors.slip = 'Transfer slip image is required';
  return Object.keys(errors).length === 0;
}

async function submit(): Promise<void> {
  if (!validate() || !project.value) return;
  submitting.value = true;
  try {
    const fd = new FormData();
    fd.append('projectId', String(project.value.id));
    fd.append('accountName', form.accountName);
    fd.append('amount', String(form.amount));
    fd.append('transferDate', form.transferDate);
    fd.append('transferTime', form.transferTime);
    if (form.remark) fd.append('remark', form.remark);
    fd.append('slip', slipFile.value!);

    const { data } = await api.post('/public/donations', fd);
    result.value = data.data;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err: any) {
    for (const e of err?.response?.data?.errors ?? []) errors[e.field] = e.message;
    if (err?.response?.data?.message && !err?.response?.data?.errors) {
      errors.slip = err.response.data.message;
    }
  } finally {
    submitting.value = false;
  }
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent';
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-gray-400 animate-pulse">Loading…</div>

  <template v-else-if="project">
    <!-- Success confirmation -->
    <div v-if="result" class="container-site py-20 max-w-xl text-center">
      <div class="text-6xl mb-6">🙏</div>
      <h1 class="text-3xl font-bold mb-3">Thank you for your donation!</h1>
      <div class="bg-gray-50 rounded-2xl p-6 text-left space-y-2 my-8">
        <div class="flex justify-between"><span class="text-gray-500">Donation ID</span><b>{{ result.donationCode }}</b></div>
        <div class="flex justify-between"><span class="text-gray-500">Project</span><b>{{ result.projectName }}</b></div>
        <div class="flex justify-between">
          <span class="text-gray-500">Status</span>
          <span class="font-semibold text-amber-600">⏳ Pending Verification</span>
        </div>
      </div>
      <p class="text-gray-500 text-sm mb-8">
        We're verifying your transfer slip automatically. Save your Donation ID to check the status anytime.
      </p>
      <div class="flex gap-3 justify-center">
        <RouterLink :to="`/donation/status/${result.donationCode}`" class="btn-primary">Check Status</RouterLink>
        <RouterLink to="/donation" class="px-6 py-3 rounded-lg border border-gray-300 font-semibold hover:bg-gray-50">All Projects</RouterLink>
      </div>
    </div>

    <template v-else>
      <!-- Banner / project info -->
      <div
        class="relative py-20 text-white text-center"
        :style="project.bannerImage
          ? { backgroundImage: `url(${project.bannerImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: themeColor }"
      >
        <div v-if="project.bannerImage" class="absolute inset-0 bg-black/50" />
        <div class="relative container-site">
          <h1 class="text-4xl font-extrabold mb-2">{{ project.name }}</h1>
          <p class="opacity-90 max-w-2xl mx-auto">{{ project.shortDescription }}</p>
        </div>
      </div>

      <div class="container-site py-12 grid gap-10 lg:grid-cols-5">
        <!-- Left: description + progress + banks -->
        <div class="lg:col-span-3 space-y-8">
          <!-- Progress -->
          <div class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
            <div class="flex justify-between items-end mb-2">
              <div>
                <div class="text-3xl font-extrabold" :style="{ color: themeColor }">
                  {{ formatCurrency(stats?.currentAmount ?? 0, project.currency) }}
                </div>
                <div class="text-sm text-gray-500">raised of {{ formatCurrency(Number(project.targetAmount), project.currency) }}</div>
              </div>
              <div class="text-right">
                <div class="text-2xl font-bold">{{ stats?.progressPercent ?? 0 }}%</div>
                <div class="text-sm text-gray-500">{{ stats?.donorCount ?? 0 }} donors</div>
              </div>
            </div>
            <div class="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all" :style="{ width: `${stats?.progressPercent ?? 0}%`, background: themeColor }" />
            </div>
            <div class="text-sm text-gray-500 mt-2">
              Remaining: {{ formatCurrency(stats?.remainingAmount ?? 0, project.currency) }}
              <span v-if="project.endDate"> · Ends {{ new Date(project.endDate).toLocaleDateString() }}</span>
            </div>
          </div>

          <!-- Description -->
          <div class="prose-cms" v-html="project.description" />

          <!-- Bank accounts -->
          <div>
            <h2 class="text-xl font-bold mb-4">Transfer to</h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <div v-for="bank in banks" :key="bank.id" class="border border-gray-200 rounded-xl p-5 flex gap-4 items-center">
                <img v-if="bank.qrCodeUrl" :src="bank.qrCodeUrl" alt="QR" class="w-24 h-24 object-contain rounded-lg border" />
                <div>
                  <div class="font-bold">{{ bank.bankName }}</div>
                  <div class="text-sm">{{ bank.accountName }}</div>
                  <div class="text-lg font-mono font-semibold tracking-wide">{{ bank.accountNumber }}</div>
                  <div v-if="bank.branch" class="text-xs text-gray-500">Branch: {{ bank.branch }}</div>
                </div>
              </div>
            </div>
            <p v-if="!banks.length" class="text-gray-400 text-sm">Bank details will be announced soon.</p>
          </div>
        </div>

        <!-- Right: donation form -->
        <div class="lg:col-span-2">
          <div class="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm sticky top-24">
            <h2 class="text-xl font-bold mb-4">Confirm your donation</h2>

            <div v-if="campaignEnded" class="text-center py-8 text-gray-500">This campaign has ended. Thank you for your support! 💛</div>

            <form v-else class="space-y-4" novalidate @submit.prevent="submit">
              <div>
                <label class="block text-sm font-medium mb-1.5">Your Name (account name) <span class="text-red-500">*</span></label>
                <input v-model="form.accountName" :class="inputClass" :style="{ '--tw-ring-color': themeColor }" />
                <p v-if="errors.accountName" class="text-xs text-red-600 mt-1">{{ errors.accountName }}</p>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1.5">Amount ({{ project.currency }}) <span class="text-red-500">*</span></label>
                <input v-model.number="form.amount" type="number" min="1" step="0.01" :class="inputClass" :style="{ '--tw-ring-color': themeColor }" />
                <p v-if="errors.amount" class="text-xs text-red-600 mt-1">{{ errors.amount }}</p>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium mb-1.5">Transfer Date <span class="text-red-500">*</span></label>
                  <input v-model="form.transferDate" type="date" :class="inputClass" />
                  <p v-if="errors.transferDate" class="text-xs text-red-600 mt-1">{{ errors.transferDate }}</p>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1.5">Time <span class="text-red-500">*</span></label>
                  <input v-model="form.transferTime" type="time" :class="inputClass" />
                  <p v-if="errors.transferTime" class="text-xs text-red-600 mt-1">{{ errors.transferTime }}</p>
                </div>
              </div>

              <!-- Slip upload: drag & drop + preview -->
              <div>
                <label class="block text-sm font-medium mb-1.5">Transfer Slip <span class="text-red-500">*</span></label>
                <label
                  class="block border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition"
                  :class="dragOver ? 'bg-gray-50' : 'border-gray-300 hover:border-gray-400'"
                  :style="dragOver ? { borderColor: themeColor } : {}"
                  @dragover.prevent="dragOver = true"
                  @dragleave="dragOver = false"
                  @drop.prevent="onDrop"
                >
                  <template v-if="slipPreview">
                    <img :src="slipPreview" alt="Slip preview" class="max-h-56 mx-auto rounded-lg mb-2" />
                    <span class="text-sm" :style="{ color: themeColor }">Tap to change</span>
                  </template>
                  <template v-else>
                    <div class="text-3xl mb-1">🧾</div>
                    <div class="text-sm text-gray-600">Drag & drop your slip here, or tap to choose</div>
                    <div class="text-xs text-gray-400 mt-1">JPG / PNG / WEBP, max 10 MB</div>
                  </template>
                  <input type="file" accept="image/*" capture="environment" hidden @change="setSlip(($event.target as HTMLInputElement).files?.[0])" />
                </label>
                <p v-if="errors.slip" class="text-xs text-red-600 mt-1">{{ errors.slip }}</p>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1.5">Remark (optional)</label>
                <textarea v-model="form.remark" rows="2" :class="inputClass" />
              </div>

              <button
                type="submit"
                class="w-full text-white font-semibold py-3.5 rounded-xl transition hover:opacity-90 disabled:opacity-50"
                :style="{ background: themeColor }"
                :disabled="submitting"
              >
                {{ submitting ? 'Submitting…' : '💛 Submit Donation' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </template>
  </template>
</template>
