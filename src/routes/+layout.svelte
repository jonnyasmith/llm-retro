<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  const destinations = [
    { href: '/overview', label: 'Overview' },
    { href: '/activity', label: 'Activity' },
    { href: '/projects', label: 'Projects' },
    { href: '/models', label: 'Models' },
    { href: '/sessions', label: 'Sessions' },
    { href: '/', label: 'Jobs' },
  ] as const;
</script>

<div class="app-shell">
  <nav aria-label="Primary">
    <a class="brand" href={resolve('/')}>LLM Retro</a>
    <div class="destinations">
      {#each destinations as destination (destination.href)}
        <a
          href={resolve(destination.href)}
          aria-current={page.url.pathname === destination.href
            ? 'page'
            : undefined}>{destination.label}</a
        >
      {/each}
    </div>
  </nav>

  {@render children()}
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    color: #17201b;
    background: #f5f1e8;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }

  .app-shell {
    min-height: 100vh;
  }

  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: min(64rem, calc(100% - 2rem));
    margin: 0 auto;
    padding: 1.25rem 0;
    border-bottom: 1px solid #d8d0c0;
  }

  nav a {
    color: #315b3d;
    font-weight: 700;
    text-decoration: none;
  }

  nav a:focus-visible {
    border-radius: 0.25rem;
    outline: 3px solid #c18a3b;
    outline-offset: 4px;
  }

  .brand {
    font-family: ui-serif, Georgia, serif;
    font-size: 1.2rem;
  }

  .destinations {
    display: flex;
    gap: clamp(0.8rem, 4vw, 1.75rem);
  }

  .destinations a {
    padding: 0.35rem 0;
    border-bottom: 2px solid transparent;
  }

  .destinations a[aria-current='page'] {
    border-bottom-color: #50755b;
  }

  @media (max-width: 32rem) {
    nav {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.8rem;
    }

    .destinations {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
