<script setup lang="ts">
import { usePracticeStore } from '../stores/practice.js'
import QuizPrompt from './QuizPrompt.vue'

/**
 * The quiz, where the quiz happens.
 *
 * On a phone the practice card is the better part of a screen below the neck
 * (UX-12): labels hide while a question is open, so from the board you cannot
 * see what was asked, and the score and Skip are a scroll away — two scrolls
 * per question. This bar puts the question, the score and the way onward
 * directly under the board, and sticks to the top of the viewport so it stays
 * with you if you scroll on. It only exists while a question does.
 */
const practice = usePracticeStore()
</script>

<template>
  <div v-if="practice.quizActive" class="quiz-bar" data-quiz-bar>
    <QuizPrompt context="bar" announce />
    <span class="quiz-bar-score" data-quiz-bar-score>
      {{ practice.score.right }}/{{ practice.score.asked }}
    </span>
  </div>
</template>

<style scoped>
.quiz-bar {
  position: sticky;
  /* Under the status bar in the app, at the top of the window on the site. */
  top: env(safe-area-inset-top, 0px);
  /* Above the board it rides over, below the popovers (30) and tuning (40). */
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.5rem;
  padding: 0.45rem 0.7rem;
  /* Opaque: the board scrolls underneath it. */
  background: var(--hb-surface);
  border: 1px solid var(--hb-border);
  border-radius: 8px;
}

.quiz-bar > :deep(.quiz-prompt) {
  flex: 1 1 auto;
  min-width: 0;
}

.quiz-bar-score {
  flex: 0 0 auto;
  font-size: 0.85rem;
  color: var(--hb-muted);
  font-variant-numeric: tabular-nums;
}
</style>
