CREATE TABLE "revoked_firebase_uids" (
    "firebase_uid" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_firebase_uids_pkey" PRIMARY KEY ("firebase_uid")
);
