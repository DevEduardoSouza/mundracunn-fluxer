# Avatar asset notice

The avatar images in this directory are the MUNDRACUNN default avatars, shown for
users who have not uploaded a picture. They replace the Fluxer-owned artwork that
this file previously covered.

They are a single drawing — a white person silhouette on a flat disc, with the
shading of the source art preserved — recoloured to the six primary colours in
`fluxer_app/src/features/user/utils/AvatarMediaUtils.ts`. The app picks one by
`id % 6`, so the palette must stay in sync with that file. The area outside the
disc is transparent: the client already clips avatars to a circle.

Artwork supplied by the community owner. Confirm its provenance and licence before
relying on this notice; if it comes from a third-party icon set, its attribution
belongs here.
