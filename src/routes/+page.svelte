<svelte:head>
  <title>LLM Retro</title>
  <meta
    name="description"
    content="A local-first view of how you work with coding harnesses."
  />
</svelte:head>

<main>
  <p class="eyebrow">Local-first work tracking</p>
  <h1>LLM Retro</h1>
  <p>Your coding-harness activity will appear here.</p>
</main>

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

  main {
    width: min(42rem, calc(100% - 3rem));
    margin: 18vh auto 0;
  }

  .eyebrow {
    color: #50755b;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.4rem 0;
    font-family: ui-serif, Georgia, serif;
    font-size: clamp(3.2rem, 12vw, 7rem);
    font-weight: 500;
    letter-spacing: -0.06em;
  }

  h1 + p {
    color: #58615c;
    font-size: 1.2rem;
  }
</style>
