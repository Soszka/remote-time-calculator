// user.service.ts
@Injectable({ providedIn: 'root' })
export class UserService {
  private users$ = of<User[]>([
    { id: 1, name: 'Kuba', age: 17 },
    { id: 2, name: 'Ania', age: 22 },
    { id: 3, name: 'Bartek', age: 30 },
  ]);

  getUsers(): Observable<User[]> {
    return this.users$;
  }
}

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-list.component.html'
})
export class UserListComponent {
  averageAge$ = this.userService.getUsers().pipe(
    map(users => {
      users.map

    })
  );

  constructor(private userService: UserService) {}
}
