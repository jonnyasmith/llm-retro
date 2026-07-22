<script lang="ts">
  let {
    eyebrow,
    title,
    description,
  }: { eyebrow: string; title: string; description: string } = $props();
</script>

<header>
  <p class="eyebrow">{eyebrow}</p>
  <h1>{title}</h1>
  <p class="lede">{description}</p>
</header>

<style>
  header {
    margin-bottom: 3rem;
  }

  .eyebrow {
    margin: 0;
    color: #50755b;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0.35rem 0;
    font-family: ui-serif, Georgia, serif;
    font-size: clamp(3.2rem, 12vw, 6rem);
    font-weight: 500;
    letter-spacing: -0.06em;
  }

  .lede {
    max-width: 42rem;
    margin: 0;
    color: #58615c;
    font-size: 1.15rem;
  }
</style>
