// SPDX-License-Identifier: AGPL-3.0-or-later

import {fromTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';

const MS_PER_HOUR = 60 * 60 * 1000;

export function snowflakeFromHoursAgo(hours: number): string {
	return fromTimestamp(Date.now() - hours * MS_PER_HOUR);
}
