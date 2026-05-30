import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Simple helper since @testing-library/jest-dom is not installed
function assertInDocument(element: HTMLElement | null, message?: string) {
  expect(element, message ?? 'Expected element to be in document').not.toBeNull();
}
function assertNotInDocument(element: HTMLElement | null, message?: string) {
  expect(element, message ?? 'Expected element NOT to be in document').toBeNull();
}
import { QuestionEditor } from './question-editor';
import type { SurveyQuestion } from '@/hooks/use-surveys';

const baseQuestion: SurveyQuestion = {
  type: 'single_choice',
  title: 'Base title',
  description: '',
  sortOrder: 0,
  isRequired: true,
  options: [
    { id: 'opt-a', label: 'A', sortOrder: 0 },
    { id: 'opt-b', label: 'B', sortOrder: 1 },
  ],
};

describe('QuestionEditor', () => {
  // ─── Basic editing ────────────────────────────────────────────────
  it('edits title and description in content tab', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('題目文字'), { target: { value: 'Updated title' } });
    fireEvent.change(screen.getByPlaceholderText('題目說明（選填）'), { target: { value: 'Updated desc' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.title).toBe('Base title');
    expect(lastCall.description).toBe('Updated desc');
  });

  it('calls onRemove when delete button is clicked', () => {
    const onRemove = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={vi.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByText('刪除'));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('toggles required checkbox', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('必填'));
    const next = onChange.mock.calls[0][0];
    expect(next.isRequired).toBe(false);
  });

  // ─── Question type selector: all 7 Phase 1 types ─────────────────
  it('switches to yes/no display type with fixed options', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('第 1 題類型'), { target: { value: 'yes_no' } });

    const next = onChange.mock.calls[0][0];
    expect(next.type).toBe('single_choice');
    expect(next.config.variant).toBe('yes_no');
    expect(next.options.map((o: { label: string }) => o.label)).toEqual(['是', '否']);
  });

  it('switches to dropdown display type preserving existing options', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('第 1 題類型'), { target: { value: 'dropdown' } });

    const next = onChange.mock.calls[0][0];
    expect(next.type).toBe('single_choice');
    expect(next.config.renderAs).toBe('dropdown');
    // Should preserve original options (opt-a, opt-b)
    expect(next.options).toHaveLength(2);
  });

  it('switches to multiple_choice type preserving existing options', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('第 1 題類型'), { target: { value: 'multiple_choice' } });

    const next = onChange.mock.calls[0][0];
    expect(next.type).toBe('multiple_choice');
    expect(next.options).toHaveLength(2);
  });

  it('switches to text type and clears options', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('第 1 題類型'), { target: { value: 'text' } });

    const next = onChange.mock.calls[0][0];
    expect(next.type).toBe('text');
    expect(next.options).toBeUndefined();
  });

  it('switches to rating type and clears options', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('第 1 題類型'), { target: { value: 'rating' } });

    const next = onChange.mock.calls[0][0];
    expect(next.type).toBe('rating');
    expect(next.options).toBeUndefined();
  });

  it('switches to numeric type with inputType config flag', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('第 1 題類型'), { target: { value: 'numeric' } });

    const next = onChange.mock.calls[0][0];
    expect(next.type).toBe('text');
    expect(next.config.inputType).toBe('numeric');
    expect(next.options).toBeUndefined();
  });

  // ─── Option editing for choice types ──────────────────────────────
  it('adds a new option', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByText('+ 新增選項'));

    const next = onChange.mock.calls[0][0];
    expect(next.options).toHaveLength(3);
    expect(next.options[2].label).toBe('');
  });

  it('removes an option', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    const removeButtons = screen.getAllByText('X');
    fireEvent.click(removeButtons[0]);

    const next = onChange.mock.calls[0][0];
    expect(next.options).toHaveLength(1);
    expect(next.options[0].label).toBe('B');
  });

  it('edits an option label', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('選項 1'), { target: { value: 'Updated A' } });

    const next = onChange.mock.calls[0][0];
    expect(next.options[0].label).toBe('Updated A');
  });

  // ─── AI quality check toggle ──────────────────────────────────────
  it('toggles per-question AI quality check flag', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('啟用 AI 品質審核（此題）'));

    const next = onChange.mock.calls[0][0];
    expect(next.config.aiQualityCheckEnabled).toBe(false);
  });

  it('defaults AI quality check to enabled when config is undefined', () => {
    const question = { ...baseQuestion, config: undefined };
    render(<QuestionEditor question={question} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);

    const checkbox = screen.getByLabelText('啟用 AI 品質審核（此題）') as HTMLInputElement;
    expect(checkbox.checked).toBe(true); // aiQualityCheckEnabled !== false → default true
  });

  // ─── Logic builder UI ─────────────────────────────────────────────
  it('adds logic rule and syncs into config.skipLogic', () => {
    const onChange = vi.fn();
    render(
      <QuestionEditor
        question={baseQuestion}
        index={0}
        onChange={onChange}
        onRemove={vi.fn()}
        jumpTargets={[{ index: 1, title: 'Next' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '邏輯' }));
    fireEvent.click(screen.getByRole('button', { name: '+ 新增跳題規則' }));

    const firstCall = onChange.mock.calls[0][0];
    expect(firstCall.config.skipLogic).toHaveLength(1);
    expect(firstCall.config.skipLogic[0].selectedOptionId).toBe('opt-a');
  });

  it('shows no jump rules message when logic tab has none', () => {
    render(<QuestionEditor question={baseQuestion} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '邏輯' }));
    assertInDocument(screen.getByText('尚未設定跳題規則。'));
  });

  it('removes a jump rule', () => {
    const onChange = vi.fn();
    const questionWithRule: SurveyQuestion = {
      ...baseQuestion,
      config: {
        skipLogic: [
          { selectedOptionId: 'opt-a', skipToQuestionIndex: 1 },
        ],
      },
    };
    render(
      <QuestionEditor
        question={questionWithRule}
        index={0}
        onChange={onChange}
        onRemove={vi.fn()}
        jumpTargets={[{ index: 1, title: 'Next Q' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '邏輯' }));
    fireEvent.click(screen.getByText('移除'));

    const next = onChange.mock.calls[0][0];
    expect(next.config.skipLogic).toBeUndefined();
  });

  it('sets a jump rule to end survey', () => {
    const onChange = vi.fn();
    const questionWithRule: SurveyQuestion = {
      ...baseQuestion,
      config: {
        skipLogic: [
          { selectedOptionId: 'opt-a', skipToQuestionIndex: 1 },
        ],
      },
    };
    render(
      <QuestionEditor
        question={questionWithRule}
        index={0}
        onChange={onChange}
        onRemove={vi.fn()}
        jumpTargets={[{ index: 1, title: 'Next Q' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '邏輯' }));

    // Find the "則跳至" select and change to "結束問卷"
    const selects = screen.getAllByRole('combobox');
    const jumpSelect = selects.find((s) => s.textContent?.includes('Next Q'));
    if (jumpSelect) {
      fireEvent.change(jumpSelect, { target: { value: '__end__' } });
      const next = onChange.mock.calls[0][0];
      expect(next.config.skipLogic[0].skipToEnd).toBe(true);
      expect(next.config.skipLogic[0].skipToQuestionIndex).toBeUndefined();
    }
  });

  // ─── Rating-specific controls ─────────────────────────────────────
  it('renders max rating input for rating type', () => {
    const ratingQuestion: SurveyQuestion = {
      type: 'rating',
      title: 'Rate us',
      sortOrder: 0,
      isRequired: true,
      config: { maxRating: 7 },
    };
    render(<QuestionEditor question={ratingQuestion} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);

    // Should show "最大評分" label
    assertInDocument(screen.getByText('最大評分'));
  });

  // ─── Numeric-specific controls ────────────────────────────────────
  it('renders min/max inputs for numeric type', () => {
    const numericQuestion: SurveyQuestion = {
      type: 'text',
      title: 'Age',
      sortOrder: 0,
      isRequired: true,
      config: { inputType: 'numeric', minValue: 0, maxValue: 100 },
    };
    render(<QuestionEditor question={numericQuestion} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);

    assertInDocument(screen.getByText('最小值'));
    assertInDocument(screen.getByText('最大值'));
  });

  // ─── Content/Logic tab switching ──────────────────────────────────
  it('starts on content tab by default', () => {
    render(<QuestionEditor question={baseQuestion} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    assertInDocument(screen.getByPlaceholderText('題目文字'));
  });

  it('switches to logic tab and hides content inputs', () => {
    render(<QuestionEditor question={baseQuestion} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '邏輯' }));
    assertNotInDocument(screen.queryByPlaceholderText('題目文字'));
    assertInDocument(screen.getByText('尚未設定跳題規則。'));
  });

  it('switches back to content tab from logic tab', () => {
    render(<QuestionEditor question={baseQuestion} index={0} onChange={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '邏輯' }));
    fireEvent.click(screen.getByRole('button', { name: '內容' }));
    assertInDocument(screen.getByPlaceholderText('題目文字'));
  });
});
