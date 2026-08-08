import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <main>
      <h1 class="sr-only">Tsuzuki</h1>
      <p>{{ statusText() }}</p>
    </main>
  `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100dvh;
        padding: 1rem;
      }

      main {
        text-align: center;
      }

      p {
        color: var(--text-secondary);
        font-size: 1.125rem;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly statusText = signal('En curso — coming soon');
}
