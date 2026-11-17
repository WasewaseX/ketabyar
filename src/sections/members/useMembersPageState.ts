import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Member } from "../../types";
import type { MemberReceipt } from "./MemberModals";

/**
 * All members-page UI state: filters, selection, dialogs, the selected
 * member, and the one-shot ?action=add-member / ?focus=search deep links.
 */
export function useMembersPageState() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [term, setTerm] = useState("");
  const [statusView, setStatusView] = useState<"all" | "active" | "suspended">(
    "all",
  );
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "number" | "joined">("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Member | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"profile" | "loans" | "holds">(
    "profile",
  );
  const [editOpen, setEditOpen] = useState(false);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const [receipt, setReceipt] = useState<MemberReceipt | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /* Deep links (?action=add-member, ?focus=search) are one-shot: the modal is
    derived from the URL so it also opens when the palette fires mid-page,
    and the param is consumed immediately so back/reload never re-fires it. */
  const addRequested = useMemo(
    () => new URLSearchParams(location.search).get("action") === "add-member",
    [location.search],
  );
  const [addOpenState, setAddOpenState] = useState(addRequested);
  const addOpen = addRequested || addOpenState;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("focus") === "search") searchRef.current?.focus();
    if (params.get("action") || params.get("focus"))
      history.replaceState(null, "", location.pathname);
  }, [location.pathname, location.search]);

  const closeAdd = () => {
    setAddOpenState(false);
    if (addRequested) navigate(location.pathname, { replace: true });
  };

  return {
    searchRef,
    term,
    setTerm,
    statusView,
    setStatusView,
    departmentFilter,
    setDepartmentFilter,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    page,
    setPage,
    selected,
    setSelected,
    sidebarTab,
    setSidebarTab,
    editOpen,
    setEditOpen,
    idCardOpen,
    setIdCardOpen,
    receipt,
    setReceipt,
    selectedIds,
    setSelectedIds,
    addOpen,
    addOpenState,
    setAddOpenState,
    closeAdd,
  };
}
