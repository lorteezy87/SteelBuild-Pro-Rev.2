import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminRoute from "../components/shared/AdminRoute";
import DeleteDialog from "../components/shared/DeleteDialog";
import { toast } from "sonner";

/**
 * FeatureFlagsAdmin
 *
 * Admin-only UI for the feature_flags table (migration 078). Lets a sole
 * admin toggle global flags, edit descriptions, and add per-email overrides
 * for opt-in betas without flipping the global flag.
 *
 * Writes go straight through `entities.FeatureFlag` — RLS is
 * permissive on writes for authenticated users, so the only thing keeping a
 * non-admin out of this surface is the AdminRoute wrap below.
 */

import {
  FeatureFlagsCommandBar,
  FeatureFlagsKpiStrip,
  NewFlagForm,
  FeatureFlagsTable,
} from "./featureFlags/FeatureFlagsAdminUi";

import {
  countEnabledFlags,
  countOverrideEntries,
  isValidOverrideEmail,
  isValidFlagKey,
  mergeOverride,
  removeOverride,
  createEmptyFlagDraft,
  createEmptyOverrideDraft,
  nextOverrideDrafts,
  nextNewFlagField,
} from "./featureFlags/featureFlagsPageHelpers";

function FeatureFlagsAdminContent() {
  const qc = useQueryClient();
  const [newFlag, setNewFlag] = useState(() => createEmptyFlagDraft());
  const [overrideDrafts, setOverrideDrafts] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: flags = [], isLoading, refetch } = useQuery({
    queryKey: ["feature_flags_admin"],
    queryFn: () => entities.FeatureFlag.list("flag_key"),
    staleTime: 30 * 1000,
  });

  const enabledCount = useMemo(() => countEnabledFlags(flags), [flags]);
  const overrideCount = useMemo(() => countOverrideEntries(flags), [flags]);

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["feature_flags_admin"] });
    qc.invalidateQueries({ queryKey: ["feature_flags"] });
  }, [qc]);

  const updateMut = useMutation({
    mutationFn: ({ id, updates }) => entities.FeatureFlag.update(id, updates),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err?.message || "Failed to update flag"),
  });

  const createMut = useMutation({
    mutationFn: (record) => entities.FeatureFlag.create(record),
    onSuccess: () => {
      invalidate();
      setNewFlag(createEmptyFlagDraft());
      toast.success("Flag created");
    },
    onError: (err) => toast.error(err?.message || "Failed to create flag"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.FeatureFlag.delete(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success("Flag deleted");
    },
    onError: (err) => toast.error(err?.message || "Failed to delete flag"),
  });

  const handleToggleEnabled = (flag) => {
    updateMut.mutate({ id: flag.id, updates: { enabled: !flag.enabled } });
  };

  const handleDescriptionBlur = (flag, nextDescription) => {
    if ((flag.description || "") === (nextDescription || "")) return;
    updateMut.mutate({ id: flag.id, updates: { description: nextDescription || null } });
  };

  const handleAddOverride = (flag) => {
    const draft = overrideDrafts[flag.id] || createEmptyOverrideDraft();
    const email = (draft.email || "").trim().toLowerCase();
    if (!isValidOverrideEmail(email)) {
      toast.error("Enter a valid email");
      return;
    }
    const overrides = mergeOverride(flag.user_overrides, email, !!draft.enabled);
    updateMut.mutate(
      { id: flag.id, updates: { user_overrides: overrides } },
      {
        onSuccess: () => {
          setOverrideDrafts((d) => nextOverrideDrafts(d, flag.id, createEmptyOverrideDraft()));
        },
      },
    );
  };

  const handleRemoveOverride = (flag, email) => {
    const overrides = removeOverride(flag.user_overrides, email);
    updateMut.mutate({ id: flag.id, updates: { user_overrides: overrides } });
  };

  const handleCreateFlag = () => {
    const key = (newFlag.flag_key || "").trim();
    if (!key) {
      toast.error("flag_key is required");
      return;
    }
    if (!isValidFlagKey(key)) {
      toast.error("flag_key must be lowercase letters, numbers, and underscores");
      return;
    }
    createMut.mutate({
      flag_key: key,
      description: newFlag.description?.trim() || null,
      enabled: !!newFlag.enabled,
      user_overrides: {},
    });
  };

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FeatureFlagsCommandBar
        flagCount={flags.length}
        enabledCount={enabledCount}
        overrideCount={overrideCount}
        onRefresh={refetch}
      />

      {!isLoading && flags.length > 0 && (
        <FeatureFlagsKpiStrip
          total={flags.length}
          enabledCount={enabledCount}
          overrideCount={overrideCount}
        />
      )}

      <NewFlagForm
        newFlag={newFlag}
        onChangeField={(field, value) => setNewFlag((f) => nextNewFlagField(f, field, value))}
        onCreate={handleCreateFlag}
        createPending={createMut.isPending}
      />

      <FeatureFlagsTable
        isLoading={isLoading}
        flags={flags}
        overrideDrafts={overrideDrafts}
        onPatchOverrideDraft={(flagId, patch) =>
          setOverrideDrafts((d) => nextOverrideDrafts(d, flagId, patch))
        }
        onDescriptionBlur={handleDescriptionBlur}
        onToggleEnabled={handleToggleEnabled}
        onAddOverride={handleAddOverride}
        onRemoveOverride={handleRemoveOverride}
        onDeleteFlag={setDeleteTarget}
        updatePending={updateMut.isPending}
      />

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete feature flag"
        description={`Delete the flag "${deleteTarget?.flag_key}"? Any UI gated on this key will fall back to its default (off). This cannot be undone.`}
      />
    </div>
  );
}

export default function FeatureFlagsAdmin() {
  return (
    <AdminRoute>
      <FeatureFlagsAdminContent />
    </AdminRoute>
  );
}
