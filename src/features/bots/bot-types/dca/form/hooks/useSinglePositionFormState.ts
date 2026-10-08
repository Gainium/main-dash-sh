import {
  useBotFormSelector,
  useBotFormTopLevelSelector,
} from '@/contexts/bots/form/BotFormProvider';
import { useHedgeBotFormOptional } from '@/contexts/bots/form/HedgeBotFormProvider';
import { BotTypesEnum } from '@/types';

/**
 * Whether the form offers single position per pair (a regular DCA bot on a
 * backend that has it — not combo, hedge, grid or a terminal deal) and whether
 * it is on.
 */
export function useSinglePositionFormState(): {
  offered: boolean;
  active: boolean;
} {
  const supported = useBotFormTopLevelSelector('singlePositionSupported');
  const type = useBotFormTopLevelSelector('type');
  const terminal = useBotFormTopLevelSelector('terminal');
  const isHedge = useHedgeBotFormOptional() !== undefined;
  const singlePosition = useBotFormSelector('singlePosition');
  const offered =
    !!supported && type === BotTypesEnum.dca && !terminal && !isHedge;
  return { offered, active: offered && !!singlePosition };
}
