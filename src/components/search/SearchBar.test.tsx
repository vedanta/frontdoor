import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  it('Enter on a shortcut → navigates to the shortcut URL', () => {
    const navigate = vi.fn();
    render(<SearchBar shortcuts={{ ny: 'https://nytimes.com' }} navigate={navigate} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ny' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('https://nytimes.com');
  });

  it('Enter on a URL-shaped input → navigates to it (https:// added if missing)', () => {
    const navigate = vi.fn();
    render(<SearchBar shortcuts={{}} navigate={navigate} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('https://example.com');
  });

  it('Enter on a free-form query → Google search', () => {
    const navigate = vi.fn();
    render(<SearchBar shortcuts={{}} navigate={navigate} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'best espresso' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('https://www.google.com/search?q=best%20espresso');
  });

  it('Enter on an empty input → no-op', () => {
    const navigate = vi.fn();
    render(<SearchBar shortcuts={{}} navigate={navigate} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Global `/` keystroke focuses the input', () => {
    render(<SearchBar shortcuts={{}} navigate={vi.fn()} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(document.activeElement).toBe(input);
  });

  it('Global `/` is ignored when target is another input', () => {
    render(
      <>
        <input data-testid="other" />
        <SearchBar shortcuts={{}} navigate={vi.fn()} />
      </>,
    );
    const otherInput = screen.getByTestId('other');
    otherInput.focus();
    fireEvent.keyDown(otherInput, { key: '/' });
    // SearchBar's input should NOT be focused
    expect(document.activeElement).toBe(otherInput);
  });
});
