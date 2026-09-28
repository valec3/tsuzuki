import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MediaItem } from '../../models/item.model';

@Component({
  selector: 'app-item-card',
  templateUrl: './item-card.component.html',
  styleUrl: './item-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemCardComponent {
  /** Entrada obligatoria: el ítem a renderizar */
  readonly item = input.required<MediaItem>();

  /** Salida: emite el ID del ítem cuando se hace click en +1 */
  readonly increment = output<string>();

  /** Porcentaje de progreso calculado reactivamente */
  protected readonly progressPercentage = computed(() => {
    const current = this.item().current_chapter;
    const total = this.item().total_chapters;
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.round((current / total) * 100));
  });

  /** Fecha formateada para el badge de creación */
  protected readonly formattedDate = computed(() => {
    const raw = this.item().created_at || this.item().started_at;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  });

  protected onIncrementClick(event: MouseEvent): void {
    event.stopPropagation();
    this.increment.emit(this.item().id);
  }
}
