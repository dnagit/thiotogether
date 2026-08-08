<script setup lang="ts">
/**
 * Keep this card, or copy a link to it.
 *
 * Its own component because the same two buttons stand under the card in its popup and on
 * the screen a visitor lands on after writing a wish, where there is no popup at all — and
 * the part worth having in exactly one place is {@link viaShareSheet}, which is where the
 * awkward truth about saving a picture from a web page lives.
 *
 * The card itself is the parent's: this only needs to be able to reach its `<svg>`.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { cardFileName, svgToPng } from './wishCard';
import { inkColor, isLightColor, lighten, outlineColor } from './balloon';

const props = withDefaults(
  defineProps<{
    /** Reached through a getter, because the card usually mounts after this does. */
    svg: () => SVGSVGElement | null;
    /** Whose wish it is; the file is named after them. */
    name: string;
    /** Absolute link that reopens this card. Empty hides the copy button. */
    link?: string;
    /** The event's colour, so the buttons belong to the party rather than to the browser. */
    themeColor?: string | null;
    /** Centred under a card that is itself centred; left-aligned in the popup. */
    center?: boolean;
  }>(),
  { link: '', themeColor: null, center: false },
);

const saving = ref(false);
const note = ref<string | null>(null);

async function renderPng(): Promise<File | null> {
  const svg = props.svg();
  if (!svg) return null;
  const blob = await svgToPng(svg);
  return new File([blob], cardFileName(props.name), { type: 'image/png' });
}

const touch = computed(
  () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches === true,
);

/**
 * Whether saving has to detour through the share sheet, which is to say: is this an iPhone.
 *
 * Everywhere else a download is a save and needs no choosing — Android drops the file
 * straight into its picture folder, which the gallery indexes, and a desktop puts it where
 * downloads go. iOS is the exception and there is no way around it: Safari exposes nothing
 * that writes to Photos, its downloads land in Files instead, and the one route to the
 * camera roll is the "Save Image" entry on the share sheet. So the sheet is opened *only*
 * there, and only because the alternative is the picture not arriving where it was asked to.
 *
 * `platform` is deprecated but is still how an iPad announces itself: since iPadOS 13 it
 * claims to be a Mac, and only the touch count gives it away.
 */
const onApple = computed(() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
});
/**
 * Deliberately not also asking for a coarse pointer: an iPad with a keyboard case attached
 * reports a fine one, and it is still an iPad, where a download still goes to Files.
 */
const viaShareSheet = computed(() => onApple.value && typeof navigator.share === 'function');

/** Both routes that end in the device's own picture library — the sheet's, and Android's. */
const toGallery = computed(() => viaShareSheet.value || touch.value);

/**
 * Whether this is a chat app's own browser rather than a browser.
 *
 * It matters because {@link download} does nothing at all in one. A LINE, Facebook or
 * Instagram WebView ignores the `download` attribute and refuses to navigate to a `blob:`
 * URL, so the click lands, no file appears, and — the part that makes it hard to spot —
 * nothing throws. There is no failure to catch and report; the button simply looks broken.
 *
 * So these are recognised up front and sent somewhere that cannot fail: see {@link preview}.
 */
const inLine = computed(
  () => typeof navigator !== 'undefined' && /\bLine\//i.test(navigator.userAgent),
);
const inAppBrowser = computed(() => {
  if (typeof navigator === 'undefined') return false;
  // `wv` is Android's own marker for a WebView; the rest name themselves.
  return inLine.value || /FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|; wv\)/i.test(navigator.userAgent);
});

/**
 * The card as a plain `<img>`, shown when there is no way to hand over a file.
 *
 * Holding a picture down and choosing "save" is the one route into the camera roll that
 * every one of these WebViews still offers, so the picture is put on screen as an ordinary
 * image and the visitor is told to do exactly that.
 */
const preview = ref<string | null>(null);
function closePreview(): void {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = null;
}
onBeforeUnmount(closePreview);

/**
 * The same page, reopened outside the chat app.
 *
 * LINE watches for this parameter on a link it is about to follow and hands the URL to the
 * system browser instead of opening it in-app — where the ordinary download works. Offered
 * as a way out, not as the fix: most people will save from the picture above it.
 */
const externalLink = computed(() => {
  if (!inLine.value || !props.link) return '';
  try {
    const url = new URL(props.link, window.location.href);
    url.searchParams.set('openExternalBrowser', '1');
    return url.toString();
  } catch {
    return '';
  }
});

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick so Safari has started the download first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  note.value = null;
  try {
    const file = await renderPng();
    if (!file) return;

    // Worth trying inside a chat app too: where the sheet exists it is the best of these
    // routes, and it is the only one that hands over an actual file.
    if ((viaShareSheet.value || inAppBrowser.value) && navigator.canShare?.({ files: [file] })) {
      try {
        // The picture alone, with no accompanying text: this is the save button, and a
        // sheet given something to say tends to offer to say it somewhere.
        await navigator.share({ files: [file], title: `คำอวยพรจาก ${props.name}` });
        return;
      } catch (err: any) {
        // Dismissing the sheet is a decision, not a failure — nothing more to do.
        if (err?.name === 'AbortError') return;
        // Anything else (a browser that offers the sheet and then refuses it) falls
        // through to whichever route below suits where we are.
      }
    }

    download(file);
    // A download on a phone is silent past a notification shade, so say where it went.
    if (touch.value) note.value = 'บันทึกรูปแล้ว — ดูได้ในแอปรูปภาพ หรือโฟลเดอร์ Download';
  } catch {
    note.value = 'บันทึกรูปไม่สำเร็จ ลองกดค้างที่การ์ดเพื่อบันทึกแทนได้';
  } finally {
    saving.value = false;
  }
}

async function copyLink(): Promise<void> {
  if (!props.link) return;
  try {
    await navigator.clipboard.writeText(props.link);
    note.value = 'คัดลอกลิงก์แล้ว';
  } catch {
    note.value = 'คัดลอกไม่สำเร็จ กรุณาคัดลอกจากแถบที่อยู่';
  }
}

/**
 * The buttons, dressed in the event's colour.
 *
 * Handed to the CSS as custom properties rather than inline styles on each button, so the
 * hover and disabled states stay in the stylesheet with the rest of the states.
 *
 * Only the filled button gets the colour itself. Everything drawn *on* white — the outline
 * button's text, and the tints its border and hover are mixed from — comes from
 * {@link inkColor} instead, because a theme is free to be yellow, or white, and the raw
 * shade of either is not something a label can be read in.
 */
const theme = computed(() => props.themeColor || '#111827');
const buttonTheme = computed(() => {
  const ink = inkColor(theme.value);
  return {
    '--act-fill': theme.value,
    '--act-fill-ink': isLightColor(theme.value) ? '#1f2937' : '#ffffff',
    '--act-fill-edge': outlineColor(theme.value),
    '--act-ink': ink,
    '--act-line': lighten(ink, 0.62),
    '--act-wash': lighten(ink, 0.92),
  };
});

defineExpose({ saving });
</script>

<template>
  <div :style="buttonTheme">
    <div class="flex flex-wrap gap-2" :class="center ? 'justify-center' : ''">
      <button type="button" class="act act-primary" :disabled="saving" @click="save">
        {{ saving ? 'กำลังบันทึก…' : toGallery ? '💾 บันทึกลงคลังรูป' : '💾 บันทึกรูป' }}
      </button>
      <button v-if="link" type="button" class="act" @click="copyLink">🔗 คัดลอกลิงก์</button>
    </div>

    <!-- Only iOS asks anything of the visitor, so only iOS is told what to answer. -->
    <p v-if="viaShareSheet" class="mt-2 text-xs text-gray-500" :class="center ? 'text-center' : ''">
      เลือก “บันทึกรูปภาพ” ในเมนูที่ขึ้นมา เพื่อเก็บการ์ดไว้ในคลังรูป
    </p>

    <p
      v-if="note"
      class="mt-3 text-sm text-gray-600"
      :class="center ? 'text-center' : ''"
      role="status"
      aria-live="polite"
    >
      {{ note }}
    </p>

    <!--
      The fallback for chat-app browsers. A real `<img>`, because holding one down is the
      only save these WebViews reliably offer — see `preview` in the script.
    -->
    <div v-if="preview" class="sheet" role="dialog" aria-modal="true" @click.self="closePreview">
      <div class="sheet-body">
        <p class="sheet-hint">กดค้างที่รูป แล้วเลือก “บันทึกรูปภาพ”</p>
        <img :src="preview" class="sheet-img" :alt="`คำอวยพรจาก ${name}`" />
        <div class="sheet-actions">
          <button type="button" class="act act-primary" @click="closePreview">เสร็จแล้ว</button>
          <a v-if="externalLink" :href="externalLink" class="act">เปิดในเบราว์เซอร์</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The `--act-*` properties are the event's colour, set on the wrapper by the script. */
.act {
  @apply inline-block rounded-lg border px-4 py-2.5 text-center text-sm font-semibold
         transition disabled:cursor-not-allowed disabled:opacity-50;
  border-color: var(--act-line);
  color: var(--act-ink);
}
.act:hover:not(:disabled) {
  background: var(--act-wash);
}
.act-primary {
  background: var(--act-fill);
  border-color: var(--act-fill-edge);
  color: var(--act-fill-ink);
}
.act-primary:hover:not(:disabled) {
  background: var(--act-fill);
  opacity: 0.9;
}

/* The save-by-long-press sheet. Only ever mounted inside a chat app's browser. */
.sheet {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(17 24 39 / 0.72);
}
.sheet-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  max-height: 100%;
  text-align: center;
}
.sheet-hint {
  @apply text-sm font-semibold text-white;
}
/*
 * `touch-callout` is left at its default on purpose: it is what raises the "Save Image"
 * menu, and the reset elsewhere in the app would otherwise take the one gesture this
 * whole sheet exists to offer.
 */
.sheet-img {
  max-width: 100%;
  min-height: 0;
  flex: 0 1 auto;
  object-fit: contain;
  border-radius: 0.75rem;
  background: #fff;
  -webkit-touch-callout: default;
}
.sheet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.sheet-actions .act {
  background: #fff;
}
</style>
