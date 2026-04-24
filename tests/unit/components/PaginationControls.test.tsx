/**
 * @jest-environment jsdom
 */
// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-003: Unit tests — PaginationControls
// PRD §Screen 2; RFC-003 §Universe Screen

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PaginationControls from '../../../src/components/universe/PaginationControls';

describe('EPIC-004/STORY-048/TASK-048-003: PaginationControls', () => {

  it('page=1, totalPages=20 → Previous disabled, Next enabled', () => {
    render(<PaginationControls page={1} totalPages={20} onPrev={jest.fn()} onNext={jest.fn()} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('page=20, totalPages=20 → Next disabled, Previous enabled', () => {
    render(<PaginationControls page={20} totalPages={20} onPrev={jest.fn()} onNext={jest.fn()} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous/i })).not.toBeDisabled();
  });

  it('page=5, totalPages=20 → both enabled', () => {
    render(<PaginationControls page={5} totalPages={20} onPrev={jest.fn()} onNext={jest.fn()} />);
    expect(screen.getByRole('button', { name: /previous/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('shows "Page 5 of 20" indicator', () => {
    render(<PaginationControls page={5} totalPages={20} onPrev={jest.fn()} onNext={jest.fn()} />);
    expect(screen.getByText('Page 5 of 20')).toBeInTheDocument();
  });

  it('page=1, totalPages=1 → both disabled', () => {
    render(<PaginationControls page={1} totalPages={1} onPrev={jest.fn()} onNext={jest.fn()} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('clicking Next calls onNext', () => {
    const onNext = jest.fn();
    render(<PaginationControls page={5} totalPages={20} onPrev={jest.fn()} onNext={onNext} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('clicking Previous calls onPrev', () => {
    const onPrev = jest.fn();
    render(<PaginationControls page={5} totalPages={20} onPrev={onPrev} onNext={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });
});
