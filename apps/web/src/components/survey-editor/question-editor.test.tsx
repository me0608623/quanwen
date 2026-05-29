import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('edits title and description in content tab', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Question text'), { target: { value: 'Updated title' } });
    fireEvent.change(screen.getByPlaceholderText('Question description'), { target: { value: 'Updated desc' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.title).toBe('Base title');
    expect(lastCall.description).toBe('Updated desc');
  });

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

    fireEvent.click(screen.getByRole('button', { name: 'Logic' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add jump rule' }));

    const firstCall = onChange.mock.calls[0][0];
    expect(firstCall.config.skipLogic).toHaveLength(1);
    expect(firstCall.config.skipLogic[0].selectedOptionId).toBe('opt-a');
  });

  it('switches to yes/no display type with fixed options', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Question 1 type'), { target: { value: 'yes_no' } });

    const next = onChange.mock.calls[0][0];
    expect(next.type).toBe('single_choice');
    expect(next.config.variant).toBe('yes_no');
    expect(next.options.map((o: { label: string }) => o.label)).toEqual(['Yes', 'No']);
  });

  it('toggles per-question AI quality check flag', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={baseQuestion} index={0} onChange={onChange} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('Enable AI quality check for this question'));

    const next = onChange.mock.calls[0][0];
    expect(next.config.aiQualityCheckEnabled).toBe(false);
  });
});
