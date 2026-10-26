<script setup lang="ts">
import { usePracticeStore } from '../stores/practice.js'

/**
 * The live question: what was asked, how it went, and the way onward.
 *
 * Two surfaces show it — the bar pinned under the neck (where the answering
 * happens) and the practice card (where the quiz is set up) — so it is one
 * component rendered twice rather than two copies of the same wording.
 */
const props = withDefaults(
  defineProps<{
    /** Which surface this instance is, for styling and for tests to scope to. */
    context: 'bar' | 'card'
    /**
     * Whether this instance is the one screen readers follow. Exactly one may
     * announce, or every question is read out twice.
     */
    announce?: boolean
  }>(),
  { announce: false },
)

const practice = usePracticeStore()
</script>

<template>
  <div class="quiz-prompt" :data-quiz-context="props.context">
    <p class="quiz-line" data-quiz-prompt :aria-live="props.announce ? 'polite' : undefined">
      <strong>{{ practice.promptText }}</strong>
      <!--
        No role="status" here: these sit inside the live region above, and a
        nested one makes some screen readers say the result twice.
      -->
      <span v-if="practice.feedback === 'right'" class="quiz-right">Right!</span>
      <span v-else-if="practice.feedback === 'wrong'" class="quiz-wrong">
        <template v-if="practice.question?.kind === 'dot'">
          It was {{ practice.question.answer }}.
        </template>
        <template v-else>Not quite — here's where it lives.</template>
      </span>
    </p>
    <div v-if="practice.question?.kind === 'dot'" class="quiz-choices">
      <button
        v-for="c in practice.question.choices"
        :key="c"
        type="button"
        class="lens-btn quiz-choice"
        :disabled="practice.feedback !== 'idle'"
        :data-quiz-choice="c"
        @click="practice.answerChoice(c)"
      >
        {{ c }}
      </button>
    </div>
    <button
      v-if="practice.feedback === 'wrong'"
      type="button"
      class="lens-btn quiz-next"
      data-quiz-next
      @click="practice.next()"
    >
      Next question
    </button>
    <button
      v-else-if="practice.feedback === 'idle'"
      type="button"
      class="lens-btn quiz-skip"
      data-quiz-skip
      @click="practice.next()"
    >
      Skip
    </button>
  </div>
</template>

<style scoped>
.quiz-prompt {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

/* In the bar the same parts sit on one line and wrap only when they must. */
.quiz-prompt[data-quiz-context='bar'] {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.6rem;
}

.quiz-line {
  margin: 0;
  font-size: 0.95rem;
}

.quiz-right {
  color: var(--hb-good);
  margin-left: 0.5rem;
  font-weight: 600;
}

.quiz-wrong {
  color: var(--hb-altered);
  margin-left: 0.5rem;
}

.quiz-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.quiz-choice {
  min-width: 3rem;
}

.quiz-next,
.quiz-skip {
  align-self: flex-start;
}

.quiz-prompt[data-quiz-context='bar'] .quiz-next,
.quiz-prompt[data-quiz-context='bar'] .quiz-skip {
  align-self: center;
  margin-left: auto;
}

.lens-btn {
  padding: 0.3rem 0.6rem;
  font: inherit;
  background: var(--hb-control-bg);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  cursor: pointer;
}

.lens-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
