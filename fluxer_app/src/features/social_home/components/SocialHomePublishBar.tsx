// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import Permission from '@app/features/permissions/state/Permission';
import styles from '@app/features/social_home/components/SocialHomePublishBar.module.css';
import {getProfessorFeedChannel} from '@app/features/social_home/utils/SocialHomeChannelDiscovery';
import {Button} from '@app/features/ui/button/Button';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {PlusIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const PUBLISH_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

const PUBLISH_DESCRIPTOR = msg({
	message: 'Publish',
	comment: 'Button that opens the professor feed channel to post directly to the class feed.',
});

interface SocialHomePublishBarProps {
	guildId: string;
}

/**
 * Only the professor/admin sees this — gated on SEND_MESSAGES in the "Feed do professor" channel
 * (see CLAUDE.md section 4). Posting itself reuses the channel's own composer instead of a
 * bespoke inline one: clicking just deep-links there, same minimal-invasion approach as the rest
 * of the Home social feature.
 */
export const SocialHomePublishBar: React.FC<SocialHomePublishBarProps> = observer(({guildId}) => {
	const {i18n} = useLingui();
	const professorFeedChannel = getProfessorFeedChannel(guildId);
	if (!professorFeedChannel) {
		return null;
	}
	const permissions = Permission.getChannelPermissions(professorFeedChannel.id) ?? 0n;
	const canPublish = (permissions & PUBLISH_PERMISSIONS) === PUBLISH_PERMISSIONS;
	if (!canPublish) {
		return null;
	}
	return (
		<div className={styles.bar} data-flx="social_home.social-home-publish-bar.bar">
			<Button
				leftIcon={<PlusIcon size={16} weight="bold" data-flx="social_home.social-home-publish-bar.plus-icon" />}
				onClick={() => RouterUtils.transitionTo(Routes.guildChannel(guildId, professorFeedChannel.id))}
				data-flx="social_home.social-home-publish-bar.publish-button"
			>
				{i18n._(PUBLISH_DESCRIPTOR)}
			</Button>
		</div>
	);
});
