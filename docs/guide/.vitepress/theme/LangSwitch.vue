<script setup lang="ts">
import { computed } from "vue";
import { TEXTS } from "../i18n";
import { lang, setLang } from "./lang";

defineProps<{ screen?: boolean }>();
const text = computed(() => TEXTS[lang.value]);
</script>

<template>
  <button
    type="button"
    class="rt-lang"
    :class="{ screen }"
    :lang="lang === 'ko' ? 'en' : 'ko'"
    :aria-label="text.switchLabel"
    :title="text.switchLabel"
    @click="setLang(lang === 'ko' ? 'en' : 'ko')"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </svg>
    <span>{{ text.switchTo }}</span>
  </button>
</template>
