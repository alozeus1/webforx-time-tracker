import { render, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

vi.mock('../components/Layout', () => ({ default: () => <main><Outlet /></main> }));
vi.mock('../pages/Login', () => ({ default: () => <h1>Login route</h1> }));
vi.mock('../pages/Dashboard', () => ({ default: () => <h1>Dashboard route</h1> }));
vi.mock('../pages/Team', () => ({ default: () => <h1>Team route</h1> }));
vi.mock('../pages/Admin', () => ({ default: () => <h1>Admin route</h1> }));

const navigateTo = (path: string) => window.history.replaceState({}, '', path);

describe('lazy application routes', () => {
  beforeEach(() => localStorage.clear());

  it('preserves the unauthenticated redirect to the lazy login route', async () => {
    navigateTo('/dashboard');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Login route' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('loads an allowed role route through its Suspense boundary', async () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user_role', 'Manager');
    navigateTo('/team');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Team route' })).toBeInTheDocument();
  });

  it('keeps role protection unchanged for admin-only routes', async () => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user_role', 'Manager');
    navigateTo('/admin');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Dashboard route' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin route' })).not.toBeInTheDocument();
  });
});
