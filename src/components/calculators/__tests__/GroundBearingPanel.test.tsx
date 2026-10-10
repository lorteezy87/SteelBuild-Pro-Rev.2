// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import GroundBearingPanel from '../GroundBearingPanel';

afterEach(cleanup);

function completeInputs(length = '4', width = '4') {
  fireEvent.change(screen.getByLabelText(/^Max outrigger reaction \(lb\)/), { target: { value: '60000' } });
  fireEvent.change(screen.getByLabelText('Mat length (ft)'), { target: { value: length } });
  fireEvent.change(screen.getByLabelText('Mat width (ft)'), { target: { value: width } });
  fireEvent.change(screen.getByLabelText('Allowable bearing (psf)'), { target: { value: '4000' } });
}

describe('ground bearing result validity', () => {
  it('renders a normal bearing calculation without a validation alert', () => {
    render(<GroundBearingPanel />);
    completeInputs();
    expect(screen.getByTestId('ground-bearing-result').textContent).toContain('3,750 psf');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an actionable numeric-range error instead of a false green overflow result', () => {
    render(<GroundBearingPanel />);
    completeInputs('1' + '0'.repeat(200), '1' + '0'.repeat(200));
    expect(screen.queryByTestId('ground-bearing-result')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('supported numeric range');
  });

  it('explains a non-positive required dimension rather than silently dropping the result', () => {
    render(<GroundBearingPanel />);
    completeInputs('0');
    expect(screen.queryByTestId('ground-bearing-result')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Mat length must be greater than zero');
  });

  it('keeps an unfinished blank form quiet', () => {
    render(<GroundBearingPanel />);
    expect(screen.queryByTestId('ground-bearing-result')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects negative mat weight and recovers when the user enters zero', () => {
    render(<GroundBearingPanel />);
    completeInputs();
    fireEvent.change(screen.getByLabelText('Mat weight (lb)'), { target: { value: '-1' } });
    expect(screen.queryByTestId('ground-bearing-result')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Mat weight must be zero or greater');
    fireEvent.change(screen.getByLabelText('Mat weight (lb)'), { target: { value: '0' } });
    expect(screen.getByTestId('ground-bearing-result').textContent).toContain('3,750 psf');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
