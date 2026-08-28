<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { usePracticeStore, type QuizKind } from '../stores/practice.js'

const practice = usePracticeStore()

const KINDS: { id: QuizKind; label: string; hint: string }[] = [
  { id: 'note', label: 'Find the note', hint: 'Tap anywhere the named note sounds' },
  { id: 'degree', label: 'Find the degree', hint: 'Tap a dot playing the named degree' },
  { id: 'dot', label: 'Name that dot', hint: 'Name the highlighted position' },
]

const prompt = computed(() => {
  const q = practice.question
  if (!q) return null
  if (q.kind === 'note') return `Tap any ${q.target} on the neck`
  if (q.kind === 'degree') return `Tap a dot playing the ${q.target}`
  return 'Which note is the highlighted dot?'
})

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
    <template v-else>
      <p class="quiz-line" data-quiz-prompt aria-live="polite">
        <strong>{{ prompt }}</strong>
        <span v-if="practice.feedback === 'right'" class="quiz-right" role="status">
          Right!
        </span>
        <span v-else-if="practice.feedback === 'wrong'" class="quiz-wrong" role="status">
          <template v-if="practice.question.kind === 'dot'">
            It was {{ practice.question.answer }}.
          </template>
          <template v-else>Not quite — here's where it lives.</template>
        </span>
      </p>
      <div v-if="practice.question.kind === 'dot'" class="quiz-choices">
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
    </template>
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

.lens-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
