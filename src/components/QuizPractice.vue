<script setup lang="ts">
import { onMounted } from 'vue'
import { usePracticeStore, type QuizKind } from '../stores/practice.js'
import QuizPrompt from './QuizPrompt.vue'

const practice = usePracticeStore()

const KINDS: { id: QuizKind; label: string; hint: string }[] = [
  { id: 'note', label: 'Find the note', hint: 'Tap anywhere the named note sounds' },
  { id: 'degree', label: 'Find the degree', hint: 'Tap a dot playing the named degree' },
  { id: 'dot', label: 'Name that dot', hint: 'Name the highlighted position' },
]

function pickKind(kind: QuizKind) {
  practice.startQuiz(kind)
}

onMounted(() => {
  if (!practice.question) practice.startQuiz(practice.quizKind)
})
</script>

<template>
  <div class="quiz" :data-feedback="practice.feedback">
    <div class="quiz-kinds" role="group" aria-label="Quiz type">
      <button
        v-for="k in KINDS"
        :key="k.id"
        type="button"
        class="lens-btn"
        :class="{ 'lens-btn-active': practice.quizKind === k.id }"
        :aria-pressed="practice.quizKind === k.id"
        :data-quiz-kind="k.id"
        :title="k.hint"
        @click="pickKind(k.id)"
      >
        {{ k.label }}
      </button>
      <span class="quiz-score" data-quiz-score>
        {{ practice.score.right }}/{{ practice.score.asked }}
      </span>
    </div>

    <p v-if="practice.question === null" class="quiz-line quiz-muted">
      Nothing to quiz here — pick a chord or scale first.
    </p>
    <!--
      The same question the bar under the neck shows. The bar is where a phone
      answers it; this copy keeps the card readable on its own — and it is the
      silent one, so the question is announced once, not twice.
    -->
    <QuizPrompt v-else context="card" />

    <p class="quiz-line quiz-muted">
      Labels hide while a question is open — miss one and the answer lights up.
    </p>
  </div>
</template>

<style scoped>
.quiz {
  margin-top: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.quiz-kinds {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.quiz-score {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: var(--hb-muted);
  font-variant-numeric: tabular-nums;
}

.quiz-line {
  margin: 0;
  font-size: 0.95rem;
}

.quiz-muted {
  color: var(--hb-muted);
  font-size: 0.8rem;
}

.lens-btn {
  padding: 0.3rem 0.6rem;
  font: inherit;
  background: var(--hb-control-bg);
  border: 1px solid var(--hb-border);
  border-radius: 6px;
  cursor: pointer;
}

.lens-btn-active {
  background: var(--hb-active-bg);
  border-color: var(--hb-accent);
  color: var(--hb-accent);
}
</style>
