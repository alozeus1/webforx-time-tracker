import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import Login from '../pages/Login';

// Mock react-router
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>
}));

describe('Login Component', () => {
  it('renders login form properly', () => {
    render(<Login />);
    expect(screen.getByPlaceholderText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument();
  });
});
