<script setup lang="ts">
/**
 * Write a birthday wish.
 *
 * The whole page is one preview with a form beside it: every choice — shape, colour,
 * photo framing, present — redraws the same balloon that will later float on the wall,
 * so nothing about the result is a surprise. On a phone the preview sits on top and
 * sticks, which keeps it in sight while the fields scroll under it.
 *
 * The gift catalogue is admin data, so it is the one thing this screen has to fetch
 * before it can be used.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { applySeo } from '@/composables/useSeo';
import {
  fetchEvent,
  isPlaceholderGift,
  submitWish,
  type BirthdayEvent,
  type CardBackground,
  type Gift,
  type WishDraft,
} from '@/api/birthday';
import { DEFAULT_COLOR, DEFAULT_FRAMING, type BalloonShapeId } from '@/components/birthday/balloon';
import BackgroundPicker from '@/components/birthday/BackgroundPicker.vue';
import BalloonColorPicker from '@/components/birthday/BalloonColorPicker.vue';
import BalloonShapePicker from '@/components/birthday/BalloonShapePicker.vue';
import GiftPicker from '@/components/birthday/GiftPicker.vue';
import PhotoFramer from '@/components/birthday/PhotoFramer.vue';
import WishBalloon from '@/components/birthday/WishBalloon.vue';
import WishCard from '@/components/birthday/WishCard.vue';
import WishCardActions from '@/components/birthday/WishCardActions.vue';

const NAME_MAX = 60;
const MESSAGE_MAX = 300;

const route = useRoute();
const router = useRouter();
const slug = String(route.params.slug || 'birthday');

const event = ref<BirthdayEvent | null>(null);
const loading = ref(true);
const submitting = ref(false);
const submitError = ref<string | null>(null);
/** The API's reply, kept whole: the id and status decide whether the wish is linkable yet. */
const result = ref<{ message: string; id: number | string; status: string } | null>(null);

const draft = reactive<WishDraft>({
  name: '',
  message: '',
  balloonShape: 'round' as BalloonShapeId,
  balloonColor: DEFAULT_COLOR,
  giftId: null,
  backgroundId: null,
  photo: null,
  photoFraming: { ...DEFAULT_FRAMING },
});

const errors = reactive<Record<string, string>>({});

const notFound = ref(false);

void (async () => {
  try {
    const e = await fetchEvent(slug);
    event.value = e;
    applySeo({
      title: e.celebrantName ? `${e.title} — ${e.celebrantName}` : e.title,
      metaDescription: e.description ?? 'Send a birthday wish with your own balloon and gift',
      ogImage: e.coverImage ?? undefined,
    });
    draft.giftId ??= e.gifts[0]?.id ?? null;
  } catch (err: any) {
    // No event means no gift catalogue and nowhere to post — a dead end, not a form to
    // fill in and have rejected on submit.
    notFound.value = err?.response?.status === 404;
    submitError.value = notFound.value
      ? 'We could not find this birthday. It may have been closed, or the link is wrong.'
      : 'Could not load this page. Please try again.';
  } finally {
    loading.value = false;
  }
})();

/**
 * True while the admin has not added any gift yet: the picker is showing stand-ins the
 * server would reject, so submitting is held rather than failing at the end of the form.
 */
const catalogueMissing = computed(() => isPlaceholderGift(draft.giftId));

const themeColor = computed(() => event.value?.themeColor ?? '#ea480c');
const gifts = computed<Gift[]>(() => event.value?.gifts ?? []);
const selectedGift = computed(() => gifts.value.find((g) => g.id === draft.giftId) ?? null);
/**
 * Which preview is on show.
 *
 * The card leads: it is the thing a visitor keeps and shares, and it has the balloon drawn
 * on it anyway, so opening on it shows more of the wish than the balloon alone does. The
 * balloon stays a tab away for anyone checking how their photo will sit in the shape.
 *
 * Picking a background also switches here by itself: the choice is invisible on the balloon,
 * and a picker that appears to do nothing is worse than a panel that changes under you.
 */
const previewView = ref<'balloon' | 'card'>('card');
watch(
  () => draft.backgroundId,
  () => (previewView.value = 'card'),
);

const backgrounds = computed<CardBackground[]>(() => event.value?.backgrounds ?? []);
/** Drives the card preview, so picking a background redraws it on the spot. */
const selectedBackground = computed(
  () => backgrounds.value.find((b) => b.id === draft.backgroundId) ?? null,
);
/** The tag shows the sender's name; a placeholder keeps the preview from collapsing while empty. */
const previewName = computed(() => draft.name.trim() || 'Your name');

/**
 * The chosen photo's object URL, owned here because both the framer and the whole-wish
 * preview draw from it — minting one apiece would leak the other on every change.
 */
const photoUrl = ref<string | null>(null);
function setPhoto(file: File | null): void {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
  photoUrl.value = file ? URL.createObjectURL(file) : null;
  draft.photo = file;
}
onBeforeUnmount(() => {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
});

/** Fields the form draws an error under; anything else has to be reported on the submit line. */
const INLINE_ERROR_FIELDS = ['name', 'message', 'gift'];

function validate(): boolean {
  for (const key of Object.keys(errors)) delete errors[key];
  if (!draft.name.trim()) errors.name = 'Please enter your name';
  else if (draft.name.trim().length > NAME_MAX)
    errors.name = `Your name can be up to ${NAME_MAX} characters`;
  if (!draft.message.trim()) errors.message = 'Please write your wish';
  else if (draft.message.trim().length > MESSAGE_MAX)
    errors.message = `Your wish can be up to ${MESSAGE_MAX} characters`;
  if (gifts.value.length && draft.giftId === null) errors.gift = 'Please choose a gift';
  return Object.keys(errors).length === 0;
}

/**
 * The card a visitor takes away with them, built from what they just sent.
 *
 * Drawn off screen: the page shows the balloon, but the thing worth keeping is the card,
 * the same one everybody else will see when they tap that balloon on the wall. It has to be
 * in the document rather than conjured on demand, because saving rasterises a real `<svg>`.
 */
const sentCard = ref<InstanceType<typeof WishCard> | null>(null);

/**
 * A link to the new card — but only once it is actually there to be opened. An event with
 * moderation on holds the wish back, and a link to a wall that has not got it yet is worse
 * than no link at all.
 */
const sentLink = computed(() => {
  if (typeof window === 'undefined' || result.value?.status !== 'APPROVED') return '';
  const url = new URL(`/birthday/${slug}`, window.location.origin);
  url.searchParams.set('wish', String(result.value.id));
  return url.toString();
});

async function submit(): Promise<void> {
  if (submitting.value || !validate()) {
    // Send focus to what needs fixing rather than leaving the visitor to hunt for it.
    document.querySelector<HTMLElement>('[data-error="true"]')?.focus();
    return;
  }
  submitting.value = true;
  submitError.value = null;
  try {
    const response = await submitWish(slug, draft);
    /*
     * The API writes its own message in Thai, so it is dropped rather than shown: the only
     * thing it says that this screen cannot work out for itself is whether the wish is up
     * yet, and `status` already carries that.
     */
    result.value = {
      ...response,
      message:
        response.status === 'APPROVED'
          ? 'Your balloon is on the wall now — go and find it.'
          : 'It will float up once an organiser has looked it over.',
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err: any) {
    const fields: { field: string; message: string }[] = err?.response?.data?.errors ?? [];
    for (const e of fields) errors[e.field] = e.message;
    // Only three fields have somewhere to show an error. A rejection on any of the rest —
    // the balloon, the photo's framing — would otherwise leave "Validation failed" sitting
    // under a form where everything visibly *is* filled in, with nothing to act on.
    const unplaced = fields.filter((e) => !INLINE_ERROR_FIELDS.includes(e.field));
    // The server's own message is Thai, so it is never shown; the statuses worth telling
    // apart are named here instead.
    submitError.value =
      err?.response?.status === 429
        ? 'Too many wishes too quickly. Wait a moment, then try again.'
        : err?.response?.status === 409
          ? 'This birthday has stopped taking new wishes.'
          : unplaced.length
            ? `Could not send your wish (${unplaced.map((e) => `${e.field}: ${e.message}`).join(', ')})`
            : 'Could not send your wish. Please try again.';
  } finally {
    submitting.value = false;
  }
}

function writeAnother(): void {
  result.value = null;
  draft.name = '';
  draft.message = '';
  setPhoto(null);
  draft.photoFraming = { ...DEFAULT_FRAMING };
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:border-transparent';
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-gray-400 animate-pulse">Loading…</div>

  <!-- No such event: nothing to write on -->
  <div v-else-if="!event" class="container-site max-w-lg py-24 text-center">
    <div class="mb-3 text-5xl" aria-hidden="true">🔍</div>
    <h1 class="mb-2 text-xl font-bold">{{ notFound ? 'Birthday not found' : 'Could not load this page' }}</h1>
    <p class="text-gray-600">{{ submitError }}</p>
  </div>

  <!-- Sent -->
  <div v-else-if="result" class="container-site max-w-xl py-16 text-center">
    <!--
      The card itself, and the very element `WishCardActions` rasterises — so what is saved
      is the card being looked at rather than a second copy drawn off screen.
    -->
    <div class="mx-auto mb-6 w-full max-w-sm">
      <WishCard
        ref="sentCard"
        :name="previewName"
        :message="draft.message"
        :balloon-shape="draft.balloonShape"
        :balloon-color="draft.balloonColor"
        :photo-url="photoUrl"
        :framing="draft.photoFraming"
        :background-url="selectedBackground?.imageUrl"
        :gift-image="selectedGift?.imageUrl"
      />
    </div>

    <h1 class="mb-2 text-2xl font-extrabold">Wish sent 🎉</h1>
    <p class="mb-6 text-gray-600">{{ result.message }}</p>

    <WishCardActions
      class="mb-8"
      center
      :svg="() => sentCard?.svg ?? null"
      :name="previewName"
      :link="sentLink"
      :theme-color="themeColor"
    />

    <div class="flex flex-wrap justify-center gap-3">
      <button
        type="button"
        class="btn-3d btn-solid"
        :style="{ '--cta': themeColor }"
        @click="router.push({ name: 'birthday-wall', params: { slug } })"
      >
        See the balloon wall
      </button>
      <button type="button" class="btn-outline" @click="writeAnother">Write another</button>
    </div>
  </div>

  <!-- Closed by the admin -->
  <div v-else-if="event && !event.isOpen" class="container-site max-w-xl py-20 text-center">
    <div class="mb-3 text-5xl" aria-hidden="true">🎈</div>
    <h1 class="mb-2 text-xl font-bold">Wishes are closed</h1>
    <p class="mb-6 text-gray-600">Thank you to everyone who sent one.</p>
    <RouterLink
      :to="{ name: 'birthday-wall', params: { slug } }"
      class="btn-3d btn-solid"
      :style="{ '--cta': themeColor }"
    >
      See the balloon wall
    </RouterLink>
  </div>

  <div v-else-if="event" class="container-site max-w-5xl py-8 sm:py-12">
    <header class="mb-8 text-center">
      <h1 class="text-2xl font-extrabold sm:text-4xl">{{ event.title }}</h1>
      <p v-if="event.celebrantName" class="mt-1 text-lg font-semibold" :style="{ color: themeColor }">
        Happy birthday, {{ event.celebrantName }}
      </p>
      <p v-if="event.description" class="mx-auto mt-2 max-w-xl text-gray-600">{{ event.description }}</p>
    </header>

    <div class="layout">
      <!-- Preview: first in the DOM so it lands above the form on a phone. -->
      <aside class="preview">
        <div class="preview-inner">
          <div class="mb-3 flex justify-center gap-1" role="tablist" aria-label="Choose a preview">
            <button
              v-for="view in ['card', 'balloon'] as const"
              :key="view"
              type="button"
              role="tab"
              class="tab"
              :class="{ 'tab-on': previewView === view }"
              :aria-selected="previewView === view"
              :style="previewView === view ? { background: themeColor } : undefined"
              @click="previewView = view"
            >
              {{ view === 'balloon' ? 'Balloon' : 'Card' }}
            </button>
          </div>

          <div v-show="previewView === 'balloon'" class="preview-stage">
            <WishBalloon
              :shape="draft.balloonShape"
              :color="draft.balloonColor"
              :photo-url="photoUrl"
              :framing="draft.photoFraming"
              :gift-image="selectedGift?.imageUrl"
              :name="previewName"
            />
          </div>

          <!--
            Kept mounted rather than swapped in, so switching tabs is instant and the
            card is already drawn the moment a background is picked.
          -->
          <div v-show="previewView === 'card'" class="preview-card">
            <WishCard
              :name="previewName"
              :message="draft.message || 'Your wish will appear here'"
              :balloon-shape="draft.balloonShape"
              :balloon-color="draft.balloonColor"
              :photo-url="photoUrl"
              :framing="draft.photoFraming"
              :background-url="selectedBackground?.imageUrl"
              :gift-image="selectedGift?.imageUrl"
            />
          </div>

          <p class="mt-4 text-xs text-gray-500">
            {{
              previewView === 'balloon'
                ? 'This balloon will float on the wish wall. Tap a balloon to read its message.'
                : 'This card is the picture you and your friends can save.'
            }}
          </p>
        </div>
      </aside>

      <form class="form" novalidate @submit.prevent="submit">
        <div>
          <label for="wish-name" class="mb-2 block font-semibold text-gray-800">Your name</label>
          <input
            id="wish-name"
            v-model="draft.name"
            type="text"
            :maxlength="NAME_MAX"
            autocomplete="name"
            placeholder="e.g. Mint"
            :class="inputClass"
            :style="{ '--tw-ring-color': themeColor }"
            :aria-invalid="!!errors.name"
            :data-error="!!errors.name"
            aria-describedby="wish-name-error"
          />
          <p class="mt-1 text-xs text-gray-500">Shown on the tag tied to your gift</p>
          <p v-if="errors.name" id="wish-name-error" class="mt-1 text-sm text-red-600" role="alert">
            {{ errors.name }}
          </p>
        </div>

        <div>
          <label for="wish-message" class="mb-2 block font-semibold text-gray-800">Your wish</label>
          <textarea
            id="wish-message"
            v-model="draft.message"
            rows="4"
            :maxlength="MESSAGE_MAX"
            placeholder="Write your birthday wish…"
            :class="inputClass"
            :style="{ '--tw-ring-color': themeColor }"
            :aria-invalid="!!errors.message"
            :data-error="!!errors.message"
            aria-describedby="wish-message-error"
          />
          <div class="mt-1 flex justify-between text-xs text-gray-500">
            <span>Shown when someone taps your balloon</span>
            <span>{{ draft.message.length }}/{{ MESSAGE_MAX }}</span>
          </div>
          <p v-if="errors.message" id="wish-message-error" class="mt-1 text-sm text-red-600" role="alert">
            {{ errors.message }}
          </p>
        </div>

        <BalloonShapePicker v-model="draft.balloonShape" :color="draft.balloonColor" />
        <BalloonColorPicker v-model="draft.balloonColor" />

        <PhotoFramer
          :photo-url="photoUrl"
          :framing="draft.photoFraming"
          :shape="draft.balloonShape"
          :color="draft.balloonColor"
          @select="setPhoto"
          @clear="setPhoto(null)"
          @update:framing="draft.photoFraming = $event"
        />

        <BackgroundPicker v-model="draft.backgroundId" :backgrounds="backgrounds" />

        <div>
          <GiftPicker v-model="draft.giftId" :gifts="gifts" />
          <p v-if="catalogueMissing" class="mt-2 text-sm text-amber-700" role="status">
            The organiser has not added any gifts yet — the ones above are only examples, so wishes cannot be sent.
          </p>
          <p v-if="errors.gift" class="mt-1 text-sm text-red-600" role="alert">{{ errors.gift }}</p>
        </div>

        <p v-if="submitError" class="text-sm text-red-600" role="alert">{{ submitError }}</p>

        <button
          type="submit"
          class="btn-3d btn-solid w-full"
          :style="{ '--cta': themeColor }"
          :disabled="submitting || catalogueMissing"
        >
          {{ submitting ? 'Sending…' : 'Float my wish 🎈' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  gap: 1.75rem;
}
@media (min-width: 900px) {
  .layout {
    /* Preview column first in the DOM, so it is also first in the reading order on a phone. */
    grid-template-columns: 300px minmax(0, 1fr);
    align-items: start;
  }
}

.preview-inner {
  border-radius: 18px;
  background: #fff;
  border: 1px solid #f3f4f6;
  box-shadow: 0 4px 14px rgb(0 0 0 / 6%);
  padding: 1.25rem;
  text-align: center;
}
@media (min-width: 900px) {
  .preview {
    position: sticky;
    /* The layout's middle band is the scrollport now, so this is an offset from its top. */
    top: 1rem;
  }
}
.preview-stage {
  display: flex;
  justify-content: center;
  --balloon-w: clamp(150px, 42vw, 210px);
}

/* The card is 720 wide by its own reckoning; here it is however wide the column is. */
.preview-card {
  max-width: 240px;
  margin: 0 auto;
}
.preview-card :deep(svg) {
  width: 100%;
  height: auto;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgb(0 0 0 / 12%);
}

.tab {
  @apply rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition;
}
.tab-on {
  @apply border-transparent text-white;
}

.form {
  display: grid;
  gap: 1.5rem;
}

/* Shape and size only; the moulding and the hover come from `.btn-3d` in `main.css`. */
.btn-solid {
  @apply inline-block rounded-lg px-6 py-3 text-center font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50;
}
.btn-outline {
  @apply rounded-lg border border-gray-300 px-6 py-3 font-medium transition hover:bg-gray-50;
}
</style>
