from fastapi import HTTPException, status

from app.models.user import User

LINKED_MEMBER_MUTATION_DENIED = (
    "Linked account members cannot edit their own member record. Ask a Super Admin to make changes."
)


def assert_can_mutate_member_record(user: User, member_id: int) -> None:
    if user.is_super_admin:
        return
    link = user.member_link
    if link and link.status == "linked" and link.member_id == member_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=LINKED_MEMBER_MUTATION_DENIED)
