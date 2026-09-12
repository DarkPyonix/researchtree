<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { TEXTS } from "../i18n";
import { lang } from "./lang";
import LangSwitch from "./LangSwitch.vue";

// At tablet widths the nav bar folds the theme switch and the social links into a flyout menu, and the
// language switch belongs there with them. VitePress gives that menu no slot, so the item is teleported
// into it once the menu is in the DOM (it always is; only CSS hides it outside those widths).
const ready = ref(false);
const text = computed(() => TEXTS[lang.value]);

onMounted(() => {
  ready.value = Boolean(document.querySelector(".VPNavBarExtra .VPMenu"));
});
</script>

<template>
  <Teleport v-if="ready" to=".VPNavBarExtra .VPMenu">
    <div class="group rt-lang-group">
      <div class="item">
        <p class="label">{{ text.language }}</p>
        <LangSwitch menu />
      </div>
    </div>
  </Teleport>
</template>
