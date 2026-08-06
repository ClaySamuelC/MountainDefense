import {
  RESOURCE_NAMES,
  canAfford,
  type Cost,
  type ResourceId,
  type WorldState,
} from '@shared';
import { ResIcon } from './icons';

/** Render a cost bag (`crude` is shown as stone). */
export function CostChips({ cost, w }: { cost: Cost; w?: WorldState }) {
  return (
    <span className="cost">
      {Object.entries(cost).map(([r, n]) => {
        const short = w ? !canAfford(w, { [r]: n } as Cost) : false;
        if (r === 'crude') {
          return (
            <span key={r} className={short ? 'short' : ''} title={RESOURCE_NAMES.stone}>
              <ResIcon id="stone" size={14} /> {n}
            </span>
          );
        }
        return (
          <span key={r} className={short ? 'short' : ''} title={RESOURCE_NAMES[r as ResourceId]}>
            <ResIcon id={r as ResourceId} size={14} /> {n}
          </span>
        );
      })}
    </span>
  );
}
