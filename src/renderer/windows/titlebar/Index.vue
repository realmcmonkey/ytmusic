<script setup lang="ts">
import { onMounted, ref } from "vue";
import TitleBar from "../../components/TitleBar.vue";
import logo from "~assets/icons/ytmd_white.png";

const keyboardFocus = ref<HTMLElement>(null);
const keyboardFocusZero = ref<HTMLElement>(null);

const isMainWindow = ref<boolean>(window.ytmd.isMainWindow);

onMounted(() => {
  window.onfocus = () => {
    if (document.activeElement != keyboardFocusZero.value) {
      // This resets the focus of keyboard navigation
      keyboardFocusZero.value.focus();
      keyboardFocusZero.value.blur();
    }
  };

  keyboardFocus.value.onfocus = () => {
    window.ytmd.switchFocus("ytm");
  };

  window.ytmd.requestWindowState();
});
</script>

<template>
  <div ref="keyboardFocusZero" tabindex="0"></div>
  <TitleBar
    :is-main-window="isMainWindow"
    :has-home-button="isMainWindow"
    :has-settings-button="isMainWindow"
    has-minimize-button
    has-maximize-button
    title="YouTube Music Desktop App"
    :icon-file="logo"
  />
  <div ref="keyboardFocus" tabindex="32767"></div>
</template>
